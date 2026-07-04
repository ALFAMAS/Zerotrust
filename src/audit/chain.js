"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertAuditLog = insertAuditLog;
exports.verifyAuditChain = verifyAuditChain;
exports.getAuditChainTip = getAuditChainTip;
const node_crypto_1 = require("node:crypto");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const logger_1 = require("../logger");
const logger = (0, logger_1.getLogger)("audit-chain");
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
];
/** Deterministic JSON: object keys sorted recursively so re-serialization is stable. */
function stableStringify(value) {
    if (value === null || value === undefined)
        return "null";
    if (typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(",")}]`;
    const keys = Object.keys(value).sort();
    return ("{" +
        keys
            .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
            .join(",") +
        "}");
}
function canonicalBody(entry) {
    const norm = {};
    for (const f of HASHED_FIELDS) {
        let val = entry[f];
        if (f === "timestamp") {
            val =
                val instanceof Date
                    ? val.toISOString()
                    : val
                        ? new Date(val).toISOString()
                        : null;
        }
        norm[f] = val ?? null;
    }
    return stableStringify(norm);
}
function computeHash(prevHash, body) {
    return (0, node_crypto_1.createHash)("sha256").update(`${prevHash}\n${body}`).digest("hex");
}
/**
 * Insert an audit row, chaining it to the previous entry. Use this instead of
 * `db.insert(auditLogsTable)` so the tamper-evidence chain stays intact.
 */
async function insertAuditLog(values) {
    const db = (0, db_1.getDb)();
    return db.transaction(async (tx) => {
        // Serialize chain writes; the lock auto-releases at transaction end.
        await tx.execute((0, drizzle_orm_1.sql) `select pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`);
        const [last] = await tx
            .select({ entryHash: schema_1.auditLogsTable.entryHash })
            .from(schema_1.auditLogsTable)
            .where((0, drizzle_orm_1.isNotNull)(schema_1.auditLogsTable.entryHash))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.auditLogsTable.seq))
            .limit(1);
        const prevHash = last?.entryHash ?? GENESIS;
        const timestamp = values.timestamp instanceof Date ? values.timestamp : new Date();
        const body = canonicalBody({ ...values, timestamp });
        const entryHash = computeHash(prevHash, body);
        const [row] = await tx
            .insert(schema_1.auditLogsTable)
            .values({ ...values, timestamp, prevHash, entryHash })
            .returning();
        return row;
    });
}
/**
 * Verify the most recent `limit` chained rows. Detects content edits
 * (recomputed hash mismatch) and deletions/reordering (broken prev→entry link).
 */
async function verifyAuditChain(limit = 1000) {
    const db = (0, db_1.getReadDb)();
    const rows = await db
        .select()
        .from(schema_1.auditLogsTable)
        .where((0, drizzle_orm_1.isNotNull)(schema_1.auditLogsTable.entryHash))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.auditLogsTable.seq))
        .limit(limit);
    rows.reverse(); // ascending by seq
    let checked = 0;
    let prevEntryHash = null;
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
    if (!rows.length)
        logger.debug("Audit chain verify: no chained rows yet");
    return { ok: true, checked };
}
/** Latest hash-chained audit row (chain tip), or null when no chained rows exist. */
async function getAuditChainTip() {
    const db = (0, db_1.getReadDb)();
    const [row] = await db
        .select({ seq: schema_1.auditLogsTable.seq, entryHash: schema_1.auditLogsTable.entryHash })
        .from(schema_1.auditLogsTable)
        .where((0, drizzle_orm_1.isNotNull)(schema_1.auditLogsTable.entryHash))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.auditLogsTable.seq))
        .limit(1);
    if (!row?.entryHash)
        return null;
    return { seq: row.seq, entryHash: row.entryHash };
}
//# sourceMappingURL=chain.js.map