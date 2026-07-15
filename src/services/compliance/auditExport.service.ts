/**
 * Signed NDJSON audit export for SIEM ingestion (Splunk, Datadog, etc.).
 * Each export includes a header with chain tip metadata and an HMAC signature
 * over the full payload for tamper detection at ingest time.
 */

import { createHmac, randomUUID } from "node:crypto";
import { asc, gt } from "drizzle-orm";
import { getAuditChainTip } from "../../audit/chain";
import { getReadDb } from "../../db";
import { auditLogsTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { getS3Config, isS3BackupEnabled } from "../../shared/s3Config";

const logger = getLogger("audit-export");

export interface NdjsonExportResult {
  ndjson: string;
  signature: string;
  exportId: string;
  rowCount: number;
  chainTip: { seq: number; entryHash: string } | null;
}

function signingKey(): string {
  const key =
    process.env.AUDIT_EXPORT_SIGNING_KEY?.trim() ||
    process.env.TOKEN_SECRET?.trim() ||
    process.env.SECURITY_TOKEN_SECRET_HEX?.trim() ||
    "";
  if (!key) {
    throw new Error("AUDIT_EXPORT_SIGNING_KEY or TOKEN_SECRET required for signed export");
  }
  return key;
}

export function signExportPayload(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("hex");
}

function serializeRow(row: typeof auditLogsTable.$inferSelect): Record<string, unknown> {
  return {
    ...row,
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
    resourceDetails: row.resourceDetails ?? null,
    continuousEvalContext: row.continuousEvalContext ?? null,
    metadata: row.metadata ?? null,
  };
}

export async function buildSignedNdjsonExport(opts: {
  limit?: number;
  since?: Date;
}): Promise<NdjsonExportResult> {
  const limit = Math.min(Math.max(opts.limit ?? 10_000, 1), 50_000);
  const db = getReadDb();

  let query = db.select().from(auditLogsTable).orderBy(asc(auditLogsTable.seq)).limit(limit);
  if (opts.since) {
    query = db
      .select()
      .from(auditLogsTable)
      .where(gt(auditLogsTable.timestamp, opts.since))
      .orderBy(asc(auditLogsTable.seq))
      .limit(limit) as typeof query;
  }
  const rows = await query;

  const exportId = randomUUID();
  const chainTip = await getAuditChainTip();
  const exportedAt = new Date().toISOString();

  const header = {
    type: "zerotrust.audit.export",
    exportId,
    exportedAt,
    rowCount: rows.length,
    chainTip,
    signatureAlgorithm: "HMAC-SHA256",
  };

  const bodyLines = rows.map((row) => JSON.stringify(serializeRow(row)));
  const ndjson = `${[JSON.stringify(header), ...bodyLines].join("\n")}\n`;
  const signature = signExportPayload(ndjson);

  return { ndjson, signature, exportId, rowCount: rows.length, chainTip };
}

/** Upload a signed export to S3-compatible storage (reuses BACKUP_S3_* config). */
export async function uploadAuditExportToS3(result: NdjsonExportResult): Promise<string | null> {
  if (!isS3BackupEnabled()) return null;

  const cfg = getS3Config();
  if (!cfg) return null;

  const { PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
  const prefix = (process.env.AUDIT_EXPORT_S3_PREFIX ?? "audit-exports/").replace(/\/?$/, "/");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const objectKey = `${prefix}${stamp}-${result.exportId}.ndjson`;

  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });

  const body = Buffer.from(result.ndjson, "utf8");
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: objectKey,
      Body: body,
      ContentLength: body.length,
      ContentType: "application/x-ndjson",
      Metadata: {
        "x-signature": result.signature,
        "x-export-id": result.exportId,
        "x-row-count": String(result.rowCount),
      },
    })
  );

  logger.info("Audit export uploaded to object storage", {
    bucket: cfg.bucket,
    key: objectKey,
    exportId: result.exportId,
  });
  return objectKey;
}

/** Most recent export metadata for admin dashboards. */
export async function getLatestAuditExportMeta(): Promise<{
  latestSeq: number | null;
  latestEntryHash: string | null;
}> {
  const tip = await getAuditChainTip();
  return {
    latestSeq: tip?.seq ?? null,
    latestEntryHash: tip?.entryHash ?? null,
  };
}
