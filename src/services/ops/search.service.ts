import { sql } from "drizzle-orm";
import { getConfig } from "../../config/index";
import { getReadDb } from "../../db/index";
import { getLogger } from "../../logger/index";
import type { StorageRegion } from "./region.service";

const logger = getLogger("search-service");

export type SearchableType = "user" | "org" | "ticket";

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
    logger.warn(
      "@elastic/elasticsearch not installed — search will use the database fallback. " +
        "To enable Elasticsearch: run `bun add @elastic/elasticsearch` and set ELASTICSEARCH_ENABLED=true"
    );
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
  limit: number
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

  const indices = type
    ? [indexName(type)]
    : ["zerotrust-user", "zerotrust-org", "zerotrust-ticket"];

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
  _orgId: string | undefined,
  type: SearchableType | undefined,
  _region: StorageRegion | undefined,
  limit: number
): Promise<SearchResults> {
  const db = getReadDb();
  const hits: SearchHit[] = [];
  const q = `%${query}%`;

  if (!type || type === "user") {
    const rows = await db.execute<{ id: string; title: string | null; email: string }>(
      sql`SELECT id, title, email FROM users WHERE email ILIKE ${q} OR display_name ILIKE ${q} LIMIT ${limit}`
    );
    for (const r of rows) {
      hits.push({
        id: r.id,
        type: "user",
        title: r.title ?? r.email,
        score: 1,
      });
    }
  }

  if (!type || type === "org") {
    const rows = await db.execute<{ id: string; name: string }>(
      sql`SELECT id, name FROM organizations WHERE name ILIKE ${q} LIMIT ${limit}`
    );
    for (const r of rows) {
      hits.push({ id: r.id, type: "org", title: r.name, score: 1 });
    }
  }

  return { total: hits.length, hits, provider: "database" };
}

// ── Smart search (ranked full-text) ──────────────────────────────────────────

export interface SemanticSearchRequest {
  query: string;
  orgId?: string;
  region?: StorageRegion;
  limit?: number;
}

interface RankedSearchRow {
  [key: string]: unknown;
  id: string;
  type: SearchableType;
  title: string;
  highlight?: string | null;
  score: number | string;
}

/**
 * Smart search — ranked full-text search across the database fallback corpus.
 * This is deliberately not advertised as semantic/vector search: no embedding
 * provider is invoked, and provider env vars cannot silently downgrade into a
 * fake "semantic" result. Elasticsearch deployments still use the ES scorer;
 * otherwise PostgreSQL `websearch_to_tsquery` ranking covers users, orgs, and
 * support tickets in one bounded query.
 */
export async function smartSearch(params: SemanticSearchRequest): Promise<SearchResults> {
  const { query, orgId, region, limit = 10 } = params;
  const client = getEsClient();

  if (client) {
    return searchElasticsearch(query, orgId, undefined, region, limit);
  }

  return smartSearchDatabase(query, orgId, region, limit);
}

async function smartSearchDatabase(
  query: string,
  orgId: string | undefined,
  region: StorageRegion | undefined,
  limit: number
): Promise<SearchResults> {
  const db = getReadDb();
  const orgFilter = orgId ?? null;
  const regionFilter = region ?? null;
  const rows = await db.execute<RankedSearchRow>(sql`
    WITH search_query AS (
      SELECT
        websearch_to_tsquery('simple', ${query}) AS tsq,
        ${query}::text AS raw_query
    )
    SELECT id, type, title, highlight, score
    FROM (
      SELECT
        u.id::text AS id,
        'user'::text AS type,
        COALESCE(NULLIF(u.display_name, ''), u.email) AS title,
        u.email AS highlight,
        ts_rank_cd(
          setweight(to_tsvector('simple', COALESCE(u.display_name, '')), 'A') ||
          setweight(to_tsvector('simple', COALESCE(u.email, '')), 'B'),
          sq.tsq
        ) AS score
      FROM users u
      CROSS JOIN search_query sq
      WHERE
        (sq.tsq @@ (
          setweight(to_tsvector('simple', COALESCE(u.display_name, '')), 'A') ||
          setweight(to_tsvector('simple', COALESCE(u.email, '')), 'B')
        ) OR u.display_name ILIKE ('%' || sq.raw_query || '%') OR u.email ILIKE ('%' || sq.raw_query || '%'))
        AND (${orgFilter}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM organization_members om WHERE om.user_id = u.id AND om.org_id = ${orgFilter}::uuid
        ))

      UNION ALL

      SELECT
        o.id::text AS id,
        'org'::text AS type,
        o.name AS title,
        o.slug AS highlight,
        ts_rank_cd(
          setweight(to_tsvector('simple', COALESCE(o.name, '')), 'A') ||
          setweight(to_tsvector('simple', COALESCE(o.slug, '')), 'B'),
          sq.tsq
        ) AS score
      FROM organizations o
      CROSS JOIN search_query sq
      WHERE
        (sq.tsq @@ (
          setweight(to_tsvector('simple', COALESCE(o.name, '')), 'A') ||
          setweight(to_tsvector('simple', COALESCE(o.slug, '')), 'B')
        ) OR o.name ILIKE ('%' || sq.raw_query || '%') OR o.slug ILIKE ('%' || sq.raw_query || '%'))
        AND (${orgFilter}::uuid IS NULL OR o.id = ${orgFilter}::uuid)
        AND (${regionFilter}::text IS NULL OR o.storage_region = ${regionFilter}::text)

      UNION ALL

      SELECT
        t.id::text AS id,
        'ticket'::text AS type,
        t.subject AS title,
        COALESCE(
          (SELECT m.body FROM support_ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1),
          t.status
        ) AS highlight,
        ts_rank_cd(
          setweight(to_tsvector('simple', COALESCE(t.subject, '')), 'A') ||
          setweight(to_tsvector('simple', COALESCE(t.status, '')), 'C'),
          sq.tsq
        ) AS score
      FROM support_tickets t
      CROSS JOIN search_query sq
      WHERE
        (sq.tsq @@ (
          setweight(to_tsvector('simple', COALESCE(t.subject, '')), 'A') ||
          setweight(to_tsvector('simple', COALESCE(t.status, '')), 'C')
        ) OR t.subject ILIKE ('%' || sq.raw_query || '%'))
        AND (${orgFilter}::uuid IS NULL OR t.org_id = ${orgFilter}::uuid)
    ) ranked
    ORDER BY score DESC, title ASC
    LIMIT ${limit}
  `);

  const hits: SearchHit[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    highlight: row.highlight ?? undefined,
    score: Number(row.score),
  }));

  return { total: hits.length, hits, provider: "database" };
}

export function isElasticsearchEnabled(): boolean {
  const cfg = getConfig();
  return cfg.elasticsearch.enabled && getEsClient() !== null;
}

export function searchProvider(): "elasticsearch" | "database" {
  return isElasticsearchEnabled() ? "elasticsearch" : "database";
}
