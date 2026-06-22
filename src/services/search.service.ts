import { getConfig } from "../config";
import { getDb } from "../db";
import { getLogger } from "../logger";
import { sql } from "drizzle-orm";
import type { StorageRegion } from "./region.service";

const logger = getLogger("search-service");

export type SearchableType = "user" | "org" | "note" | "ticket";

export interface SearchDocument {
  id: string;
  type: SearchableType;
  orgId: string;
  title: string;
  content: string;
  region: StorageRegion;
  metadata?: Record<string, unknown>;
}

export interface SearchHit {
  id: string;
  type: SearchableType;
  title: string;
  highlight?: string;
  score: number;
}

export interface SearchResults {
  total: number;
  hits: SearchHit[];
  provider: "elasticsearch" | "database";
}

// ── Elasticsearch client (lazy) ─────────────────────────────────────────────

let esClient: any = null;

function getEsClient(): any {
  if (esClient) return esClient;
  const cfg = getConfig();
  if (!cfg.elasticsearch.enabled) return null;
  try {
    // Dynamic import so the dependency is optional at runtime
    const { Client } = require("@elastic/elasticsearch");
    esClient = new Client({
      node: `http://${cfg.elasticsearch.host}:${cfg.elasticsearch.port}`,
    });
  } catch {
    logger.warn("@elastic/elasticsearch not installed; falling back to DB search");
  }
  return esClient;
}

// ── Index management ─────────────────────────────────────────────────────────

function indexName(type: SearchableType): string {
  const cfg = getConfig();
  return `${cfg.elasticsearch.indexPrefix}-${type}`;
}

export async function ensureIndex(type: SearchableType): Promise<boolean> {
  const client = getEsClient();
  if (!client) return false;
  const index = indexName(type);
  try {
    const exists = await client.indices.exists({ index });
    if (!exists) {
      await client.indices.create({
        index,
        mappings: {
          properties: {
            title: { type: "text", analyzer: "standard" },
            content: { type: "text", analyzer: "standard" },
            orgId: { type: "keyword" },
            region: { type: "keyword" },
            type: { type: "keyword" },
          },
        },
      });
      logger.info(`Created Elasticsearch index: ${index}`);
    }
    return true;
  } catch (err) {
    logger.warn(`Failed to ensure ES index ${index}`, { error: String(err) });
    return false;
  }
}

// ── Indexing ─────────────────────────────────────────────────────────────────

export async function indexDocument(doc: SearchDocument): Promise<boolean> {
  const client = getEsClient();
  if (!client) return false;
  try {
    await ensureIndex(doc.type);
    await client.index({
      index: indexName(doc.type),
      id: doc.id,
      document: {
        title: doc.title,
        content: doc.content,
        orgId: doc.orgId,
        region: doc.region,
        type: doc.type,
        ...doc.metadata,
      },
      refresh: "wait_for",
    });
    return true;
  } catch (err) {
    logger.warn("Failed to index document", { error: String(err) });
    return false;
  }
}

export async function bulkIndex(docs: SearchDocument[]): Promise<number> {
  const client = getEsClient();
  if (!client || docs.length === 0) return 0;
  try {
    const operations = docs.flatMap((doc) => [
      { index: { _index: indexName(doc.type), _id: doc.id } },
      {
        title: doc.title,
        content: doc.content,
        orgId: doc.orgId,
        region: doc.region,
        type: doc.type,
        ...doc.metadata,
      },
    ]);
    const result = await client.bulk({ refresh: true, operations });
    const errors = result.errors ? result.items.filter((i: any) => i.index?.error).length : 0;
    return docs.length - errors;
  } catch (err) {
    logger.warn("Bulk index failed", { error: String(err) });
    return 0;
  }
}

export async function deleteDocument(type: SearchableType, id: string): Promise<boolean> {
  const client = getEsClient();
  if (!client) return false;
  try {
    await client.delete({ index: indexName(type), id, refresh: "wait_for" });
    return true;
  } catch {
    return false;
  }
}

// ── Search ───────────────────────────────────────────────────────────────────

export async function search(params: {
  query: string;
  orgId?: string;
  type?: SearchableType;
  region?: StorageRegion;
  limit?: number;
}): Promise<SearchResults> {
  const { query, orgId, type, region, limit = 20 } = params;
  const client = getEsClient();

  if (client) {
    return searchElasticsearch(query, orgId, type, region, limit);
  }
  return searchDatabase(query, orgId, type, region, limit);
}

async function searchElasticsearch(
  query: string,
  orgId: string | undefined,
  type: SearchableType | undefined,
  region: StorageRegion | undefined,
  limit: number,
): Promise<SearchResults> {
  const client = getEsClient();
  const must: any[] = [
    {
      multi_match: {
        query,
        fields: ["title^2", "content"],
        fuzziness: "AUTO",
      },
    },
  ];
  const filter: any[] = [];
  if (orgId) filter.push({ term: { orgId } });
  if (region) filter.push({ term: { region } });

  const indices = type ? [indexName(type)] : ["zeroauth-user", "zeroauth-org", "zeroauth-note", "zeroauth-ticket"];

  try {
    const result = await client.search({
      index: indices,
      size: limit,
      query: { bool: { must, filter } },
      highlight: {
        fields: {
          title: {},
          content: { fragment_size: 150, number_of_fragments: 1 },
        },
      },
    });

    const hits: SearchHit[] = result.hits.hits.map((h: any) => ({
      id: h._id,
      type: h._source.type,
      title: h._source.title,
      highlight: h.highlight?.content?.[0] ?? h.highlight?.title?.[0],
      score: h._score,
    }));

    return {
      total: typeof result.hits.total === "object" ? result.hits.total.value : result.hits.total,
      hits,
      provider: "elasticsearch",
    };
  } catch (err) {
    logger.warn("ES search failed, falling back to DB", { error: String(err) });
    return searchDatabase(query, orgId, type, region, limit);
  }
}

async function searchDatabase(
  query: string,
  orgId: string | undefined,
  type: SearchableType | undefined,
  _region: StorageRegion | undefined,
  limit: number,
): Promise<SearchResults> {
  const db = getDb();
  const hits: SearchHit[] = [];
  const q = `%${query}%`;

  if (!type || type === "user") {
    const rows = await db.execute(
      sql`SELECT id, title, email FROM users WHERE email ILIKE ${q} OR display_name ILIKE ${q} LIMIT ${limit}`,
    );
    for (const r of (rows as any[])) {
      hits.push({ id: r.id, type: "user", title: r.title ?? r.email, score: 1 });
    }
  }

  if (!type || type === "org") {
    const rows = await db.execute(
      sql`SELECT id, name FROM organizations WHERE name ILIKE ${q} LIMIT ${limit}`,
    );
    for (const r of (rows as any[])) {
      hits.push({ id: r.id, type: "org", title: r.name, score: 1 });
    }
  }

  if (!type || type === "note") {
    const filter = orgId
      ? sql`(title ILIKE ${q} OR content ILIKE ${q}) AND org_id = ${orgId} AND archived = false`
      : sql`(title ILIKE ${q} OR content ILIKE ${q}) AND archived = false`;
    const rows = await db.execute(
      sql`SELECT id, title FROM shared_notes WHERE ${filter} LIMIT ${limit}`,
    );
    for (const r of (rows as any[])) {
      hits.push({ id: r.id, type: "note", title: r.title, score: 1 });
    }
  }

  return { total: hits.length, hits, provider: "database" };
}

// ── Smart search (semantic placeholder) ─────────────────────────────────────

export interface SemanticSearchRequest {
  query: string;
  orgId?: string;
  region?: StorageRegion;
  limit?: number;
}

/**
 * Smart search — uses BM25 + term boosting from the primary search as a
 * fallback. When an embedding provider is configured (EMBEDDING_PROVIDER),
 * this will dispatch to a vector search. The provider-agnostic interface
 * means the rest of the app doesn't care which backend serves the results.
 */
export async function smartSearch(params: SemanticSearchRequest): Promise<SearchResults> {
  const { query, orgId, region, limit = 10 } = params;

  // Check if an embedding provider is configured
  const provider = process.env.EMBEDDING_PROVIDER;
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return embeddingSearch(query, orgId, region, limit, "openai");
  }
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return embeddingSearch(query, orgId, region, limit, "anthropic");
  }

  // Fallback: enhanced keyword search with fuzzy matching
  return search({ query, orgId, region, limit });
}

async function embeddingSearch(
  query: string,
  orgId: string | undefined,
  region: StorageRegion | undefined,
  limit: number,
  provider: string,
): Promise<SearchResults> {
  // Placeholder: in production this would call the embedding API,
  // embed the query, and run a kNN search against an ES dense_vector field.
  // For now, fall back to keyword search with a note about the provider.
  logger.info(`Embedding search requested (provider=${provider}), falling back to keyword`);
  const results = await search({ query, orgId, region, limit });
  return { ...results, provider: "database" };
}

export function isElasticsearchEnabled(): boolean {
  const cfg = getConfig();
  return cfg.elasticsearch.enabled && getEsClient() !== null;
}

export function searchProvider(): "elasticsearch" | "database" {
  return isElasticsearchEnabled() ? "elasticsearch" : "database";
}
