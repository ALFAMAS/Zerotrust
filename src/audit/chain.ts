/**
 * Tamper-evident audit log (SOC 2 CC7).
 *
 * Every persisted audit row is hash-chained to its predecessor:
 *
 *   entryHash = sha256(prevHash + "\n" + canonicalBody(row))
 *
 * `prevHash` is the previous row's `entryHash` (or the genesis hash for the
 * first chained row). Editing a field, deleting a row, or reordering rows all
 * break the chain, which `verifyAuditChain()` detects. Writes are serialized
 * with a transaction-scoped Postgres advisory lock so the chain stays linear
 * under concurrency.
 *
 * Rows written before this feature shipped have a NULL `entryHash` and are
 * treated as un-chained legacy; the chain begins at the first row with a hash.
 */

import { createHash } from "node:crypto";
import { desc, isNotNull, sql } from "drizzle-orm";
import { getDb, getReadDb } from "../db";
import { auditLogsTable } from "../db/schema";
import { getLogger } from "../logger";

const logger = getLogger("audit-chain");

const GENESIS = "0".repeat(64);
// Arbitrary, stable advisory-lock key reserved for the audit chain writer.
const CHAIN_LOCK_KEY = 4823719;

// The immutable content fields covered by the hash. `id`, `seq`, `prevHash`,
// and `entryHash` are deliberately excluded (structural / derived).
const HASHED_FIELDS = [
  "action",
  "actorId",
  "actorEmail",
  "targetId",
  "targetType",
  "ipAddress",
  "country",
  "userAgent",
  "deviceHash",
  "sessionId",
  "success",
  "errorCode",
  "duration",
  "resourceDetails",
  "riskScore",
  "continuousEvalContext",
  "metadata",
  "timestamp",
] as const;

/** Deterministic JSON: object keys sorted recursively so re-serialization is stable. */
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

function canonicalBody(entry: Record<string, unknown>): string {
  const norm: Record<string, unknown> = {};
  for (const f of HASHED_FIELDS) {
    let val = entry[f];
    if (f === "timestamp") {
      val =
        val instanceof Date
          ? val.toISOString()
          : val
            ? new Date(val as string).toISOString()
            : null;
    }
    norm[f] = val ?? null;
  }
  return stableStringify(norm);
}

function computeHash(prevHash: string, body: string): string {
  return createHash("sha256").update(`${prevHash}\n${body}`).digest("hex");
}

export type AuditInsert = typeof auditLogsTable.$inferInsert;

/**
 * Insert an audit row, chaining it to the previous entry. Use this instead of
 * `db.insert(auditLogsTable)` so the tamper-evidence chain stays intact.
 */
export async function insertAuditLog(
  values: AuditInsert
): Promise<typeof auditLogsTable.$inferSelect> {
  const db = getDb();
  return db.transaction(async (tx) => {
    // Serialize chain writes; the lock auto-releases at transaction end.
    await tx.execute(sql`select pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`);

    const [last] = await tx
      .select({ entryHash: auditLogsTable.entryHash })
      .from(auditLogsTable)
      .where(isNotNull(auditLogsTable.entryHash))
      .orderBy(desc(auditLogsTable.seq))
      .limit(1);

    const prevHash = last?.entryHash ?? GENESIS;
    const timestamp = values.timestamp instanceof Date ? values.timestamp : new Date();
    const body = canonicalBody({ ...values, timestamp });
    const entryHash = computeHash(prevHash, body);

    const [row] = await tx
      .insert(auditLogsTable)
      .values({ ...values, timestamp, prevHash, entryHash })
      .returning();
    return row;
  });
}

export interface ChainVerifyResult {
  ok: boolean;
  checked: number;
  brokenAt?: { seq: number; id: string; reason: "content-hash-mismatch" | "broken-link" };
}

/**
 * Verify the most recent `limit` chained rows. Detects content edits
 * (recomputed hash mismatch) and deletions/reordering (broken prev→entry link).
 */
export async function verifyAuditChain(limit = 1000): Promise<ChainVerifyResult> {
  const db = getReadDb();
  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(isNotNull(auditLogsTable.entryHash))
    .orderBy(desc(auditLogsTable.seq))
    .limit(limit);
  rows.reverse(); // ascending by seq

  let checked = 0;
  let prevEntryHash: string | null = null;
  for (const row of rows) {
    checked++;
    const expected = computeHash(row.prevHash ?? GENESIS, canonicalBody(row));
    if (expected !== row.entryHash) {
      return {
        ok: false,
        checked,
        brokenAt: { seq: row.seq, id: row.id, reason: "content-hash-mismatch" },
      };
    }
    if (prevEntryHash !== null && row.prevHash !== prevEntryHash) {
      return { ok: false, checked, brokenAt: { seq: row.seq, id: row.id, reason: "broken-link" } };
    }
    prevEntryHash = row.entryHash;
  }

  if (!rows.length) logger.debug("Audit chain verify: no chained rows yet");
  return { ok: true, checked };
}
