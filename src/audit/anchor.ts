/**
 * Audit log external anchoring (SOC 2 CC7 tamper evidence).
 *
 * Periodically records the latest hash-chain tip (`seq`, `entryHash`) to an
 * append-only store: the `audit_log_anchors` table plus optional S3-compatible
 * object storage. Verification compares the live chain tip to the latest anchor.
 */

import { createHash } from "node:crypto";
import { desc } from "drizzle-orm";
import { getDb, getReadDb } from "../db";
import { auditLogAnchorsTable } from "../db/schema";
import { getLogger } from "../logger";
import { getS3Config, isS3BackupEnabled } from "../services/ops/objectStorage.service";
import { getAuditChainTip } from "./chain";

const logger = getLogger("audit-anchor");

export interface AuditAnchorRecord {
  system: "zerotrust";
  environment: string;
  anchoredAt: string;
  latestSeq: number;
  latestEntryHash: string;
  previousAnchorHash: string | null;
  anchorHash: string;
}

export interface AnchorRunResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  anchorId?: string;
  externalKey?: string;
  latestSeq?: number;
  latestEntryHash?: string;
  error?: string;
}

export interface AnchorVerifyResult {
  ok: boolean;
  reason?: string;
  chainTip?: { seq: number; entryHash: string };
  anchor?: { seq: number; entryHash: string; anchoredAt: string; anchorHash: string };
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(",") +
    "}"
  );
}

function environmentName(): string {
  return process.env.AUDIT_ANCHOR_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development";
}

export function computeAnchorHash(
  previousAnchorHash: string | null,
  body: Omit<AuditAnchorRecord, "anchorHash">
): string {
  const payload = stableStringify({ ...body, previousAnchorHash });
  const prefix = previousAnchorHash ?? "genesis";
  return createHash("sha256").update(`${prefix}\n${payload}`).digest("hex");
}

async function getLatestStoredAnchor(): Promise<typeof auditLogAnchorsTable.$inferSelect | null> {
  const db = getReadDb();
  const [row] = await db
    .select()
    .from(auditLogAnchorsTable)
    .orderBy(desc(auditLogAnchorsTable.anchoredAt))
    .limit(1);
  return row ?? null;
}

async function uploadAnchorToS3(record: AuditAnchorRecord, stamp: string): Promise<string | null> {
  if (!isS3BackupEnabled()) return null;

  const { PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
  const cfg = getS3Config();
  if (!cfg) return null;

  const prefix = (process.env.AUDIT_ANCHOR_S3_PREFIX ?? "audit-anchors/").replace(/\/?$/, "/");
  const objectKey = `${prefix}${environmentName()}/${stamp}.json`;
  const body = Buffer.from(`${stableStringify(record)}\n`, "utf8");

  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: objectKey,
      Body: body,
      ContentLength: body.length,
      ContentType: "application/json",
    })
  );

  logger.info("Audit anchor uploaded to object storage", { bucket: cfg.bucket, key: objectKey });
  return objectKey;
}

/**
 * Create a new anchor for the current audit chain tip. Skips when the tip is
 * unchanged since the last anchor (idempotent).
 */
export async function runAuditAnchor(): Promise<AnchorRunResult> {
  if (process.env.AUDIT_ANCHOR_ENABLED !== "true") {
    return { ok: true, skipped: true, reason: "AUDIT_ANCHOR_ENABLED is not true" };
  }

  try {
    const tip = await getAuditChainTip();
    if (!tip) {
      return { ok: true, skipped: true, reason: "no chained audit rows yet" };
    }

    const previous = await getLatestStoredAnchor();
    if (previous && previous.latestSeq === tip.seq && previous.latestEntryHash === tip.entryHash) {
      return {
        ok: true,
        skipped: true,
        reason: "chain tip unchanged since last anchor",
        latestSeq: tip.seq,
        latestEntryHash: tip.entryHash,
      };
    }

    const anchoredAt = new Date();
    const stamp = anchoredAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const previousAnchorHash = previous?.anchorHash ?? null;
    const body: Omit<AuditAnchorRecord, "anchorHash"> = {
      system: "zerotrust",
      environment: environmentName(),
      anchoredAt: anchoredAt.toISOString(),
      latestSeq: tip.seq,
      latestEntryHash: tip.entryHash,
      previousAnchorHash,
    };
    const anchorHash = computeAnchorHash(previousAnchorHash, body);
    const record: AuditAnchorRecord = { ...body, anchorHash };

    const externalKey = await uploadAnchorToS3(record, stamp);

    const db = getDb();
    const [row] = await db
      .insert(auditLogAnchorsTable)
      .values({
        anchoredAt,
        environment: body.environment,
        latestSeq: tip.seq,
        latestEntryHash: tip.entryHash,
        previousAnchorHash,
        anchorHash,
        externalKey,
      })
      .returning();

    logger.info("Audit anchor recorded", {
      anchorId: row.id,
      latestSeq: tip.seq,
      externalKey: externalKey ?? undefined,
    });

    return {
      ok: true,
      anchorId: row.id,
      externalKey: externalKey ?? undefined,
      latestSeq: tip.seq,
      latestEntryHash: tip.entryHash,
    };
  } catch (err) {
    logger.error("Audit anchor failed", { error: String(err) });
    return { ok: false, error: String(err) };
  }
}

/**
 * Verify that the latest stored anchor matches the current audit chain tip and
 * that the anchor hash chain is internally consistent.
 */
export async function verifyAuditAnchors(): Promise<AnchorVerifyResult> {
  const tip = await getAuditChainTip();
  if (!tip) {
    return { ok: true, reason: "no chained audit rows yet" };
  }

  const anchor = await getLatestStoredAnchor();
  if (!anchor) {
    return {
      ok: false,
      reason: "no anchors recorded yet",
      chainTip: tip,
    };
  }

  const body: Omit<AuditAnchorRecord, "anchorHash"> = {
    system: "zerotrust",
    environment: anchor.environment,
    anchoredAt: anchor.anchoredAt.toISOString(),
    latestSeq: anchor.latestSeq,
    latestEntryHash: anchor.latestEntryHash,
    previousAnchorHash: anchor.previousAnchorHash,
  };
  const expectedHash = computeAnchorHash(anchor.previousAnchorHash, body);
  if (expectedHash !== anchor.anchorHash) {
    return {
      ok: false,
      reason: "anchor hash mismatch (tampered anchor record)",
      chainTip: tip,
      anchor: {
        seq: anchor.latestSeq,
        entryHash: anchor.latestEntryHash,
        anchoredAt: anchor.anchoredAt.toISOString(),
        anchorHash: anchor.anchorHash,
      },
    };
  }

  if (anchor.latestSeq !== tip.seq || anchor.latestEntryHash !== tip.entryHash) {
    return {
      ok: false,
      reason: "chain tip does not match latest anchor (new audit rows since last anchor)",
      chainTip: tip,
      anchor: {
        seq: anchor.latestSeq,
        entryHash: anchor.latestEntryHash,
        anchoredAt: anchor.anchoredAt.toISOString(),
        anchorHash: anchor.anchorHash,
      },
    };
  }

  return {
    ok: true,
    chainTip: tip,
    anchor: {
      seq: anchor.latestSeq,
      entryHash: anchor.latestEntryHash,
      anchoredAt: anchor.anchoredAt.toISOString(),
      anchorHash: anchor.anchorHash,
    },
  };
}
