/**
 * Elasticsearch audit pipeline.
 * Bulk-indexes AuditLog documents into daily indices (zerotrust-audit-YYYY-MM-DD).
 * Masks sensitive fields before shipping.
 */

import { getConfig } from "../config";
import { getLogger } from "../logger";
import type { AuditLog } from "../shared/types";

const logger = getLogger("audit-pipeline");

const SENSITIVE_FIELDS = new Set([
  "code",
  "token",
  "secret",
  "password",
  "otp",
  "pin",
]);

interface ESBulkItem {
  index: { _index: string; _id?: string };
}

let flushInterval: ReturnType<typeof setInterval> | null = null;
const pendingDocs: AuditLog[] = [];
let esClient: any = null;

function maskSensitiveFields(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = [...SENSITIVE_FIELDS].some((f) => lowerKey.includes(f));
    if (isSensitive && typeof value === "string") {
      result[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = maskSensitiveFields(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function getIndexName(): string {
  const today = new Date().toISOString().slice(0, 10);
  const cfg = getConfig();
  return `${cfg.elasticsearch.indexPrefix}-audit-${today}`;
}

async function buildEsClient() {
  const cfg = getConfig();
  if (!cfg.elasticsearch.enabled) return null;

  const baseUrl = `http://${cfg.elasticsearch.host}:${cfg.elasticsearch.port}`;

  return {
    async bulk(docs: AuditLog[]) {
      const body: (ESBulkItem | Record<string, unknown>)[] = [];
      const index = getIndexName();

      for (const doc of docs) {
        body.push({ index: { _index: index } });
        const masked = maskSensitiveFields(
          doc as unknown as Record<string, unknown>,
        );
        body.push(masked);
      }

      const ndjson = `${body.map((line) => JSON.stringify(line)).join("\n")}\n`;

      const response = await fetch(`${baseUrl}/_bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/x-ndjson" },
        body: ndjson,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `ES bulk error ${response.status}: ${text.slice(0, 200)}`,
        );
      }

      return response.json();
    },

    async health(): Promise<{ status: string; available: boolean }> {
      try {
        const response = await fetch(`${baseUrl}/_cluster/health`, {
          signal: AbortSignal.timeout(3000),
        });
        const data = (await response.json()) as any;
        return { status: data.status || "unknown", available: response.ok };
      } catch {
        return { status: "unreachable", available: false };
      }
    },

    async putILMPolicy() {
      const cfg = getConfig();
      const policyName = `${cfg.elasticsearch.indexPrefix}-audit-ilm`;
      const policy = {
        policy: {
          phases: {
            hot: {
              min_age: "0ms",
              actions: { rollover: { max_age: "1d", max_size: "5gb" } },
            },
            warm: {
              min_age: "7d",
              actions: {
                shrink: { number_of_shards: 1 },
                forcemerge: { max_num_segments: 1 },
              },
            },
            cold: { min_age: "30d", actions: { freeze: {} } },
            delete: { min_age: "90d", actions: { delete: {} } },
          },
        },
      };

      const response = await fetch(`${baseUrl}/_ilm/policy/${policyName}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.warn("Failed to create ILM policy", {
          status: response.status,
          body: text.slice(0, 200),
        });
      } else {
        logger.info("ILM policy applied", { policyName });
      }
    },
  };
}

async function flushPendingDocs(): Promise<void> {
  if (pendingDocs.length === 0) return;

  const batch = pendingDocs.splice(0, pendingDocs.length);
  try {
    if (!esClient) esClient = await buildEsClient();
    if (!esClient) return;

    await esClient.bulk(batch);
    logger.debug("Flushed audit docs to Elasticsearch", {
      count: batch.length,
    });
  } catch (err) {
    logger.error("Failed to flush audit docs to Elasticsearch", err as Error);
    pendingDocs.unshift(...batch);
  }
}

export async function initAuditPipeline(flushIntervalMs = 5000): Promise<void> {
  const cfg = getConfig();
  if (!cfg.elasticsearch.enabled) {
    logger.info("Elasticsearch audit pipeline disabled");
    return;
  }

  esClient = await buildEsClient();
  if (!esClient) return;

  try {
    await esClient.putILMPolicy();
  } catch (err) {
    logger.warn("Could not apply ILM policy at startup", { err });
  }

  if (flushInterval) clearInterval(flushInterval);
  flushInterval = setInterval(() => {
    void flushPendingDocs();
  }, flushIntervalMs);
  if (flushInterval.unref) flushInterval.unref();

  logger.info("Elasticsearch audit pipeline initialized", { flushIntervalMs });
}

export function queueAuditDoc(doc: AuditLog): void {
  pendingDocs.push(doc);
}

export async function flushAuditPipeline(): Promise<void> {
  await flushPendingDocs();
}

export async function getElasticsearchHealth(): Promise<{
  status: string;
  available: boolean;
}> {
  try {
    if (!esClient) esClient = await buildEsClient();
    if (!esClient) return { status: "disabled", available: false };
    return await esClient.health();
  } catch {
    return { status: "error", available: false };
  }
}

export async function indexAuditLogToES(doc: AuditLog): Promise<void> {
  queueAuditDoc(doc);
}

export async function shutdownAuditPipeline(): Promise<void> {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
  await flushPendingDocs();
}
