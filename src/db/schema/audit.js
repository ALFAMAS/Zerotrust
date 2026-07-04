"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accessReviewItemsTable = exports.accessReviewsTable = exports.auditLogAnchorsTable = exports.auditLogsTable = void 0;
/** DI-1 — audit domain tables. */
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
exports.auditLogsTable = (0, pg_core_1.pgTable)("audit_logs", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    action: (0, pg_core_1.text)("action").notNull(),
    actorId: (0, pg_core_1.uuid)("actor_id"),
    actorEmail: (0, pg_core_1.text)("actor_email"),
    targetId: (0, pg_core_1.text)("target_id"),
    targetType: (0, pg_core_1.text)("target_type"),
    ipAddress: (0, pg_core_1.text)("ip_address"),
    country: (0, pg_core_1.text)("country"),
    userAgent: (0, pg_core_1.text)("user_agent"),
    deviceHash: (0, pg_core_1.text)("device_hash"),
    sessionId: (0, pg_core_1.text)("session_id"),
    success: (0, pg_core_1.boolean)("success").notNull(),
    errorCode: (0, pg_core_1.text)("error_code"),
    duration: (0, pg_core_1.integer)("duration"),
    resourceDetails: (0, pg_core_1.jsonb)("resource_details"),
    riskScore: (0, pg_core_1.integer)("risk_score"),
    continuousEvalContext: (0, pg_core_1.jsonb)("continuous_eval_context"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    timestamp: (0, pg_core_1.timestamp)("timestamp", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    // Tamper-evidence: monotonic sequence gives a strict total order, and each
    // entry's hash chains to the previous one (entryHash = sha256(prevHash + body)).
    // Editing/deleting/reordering any row breaks the chain — see audit/chain.ts.
    seq: (0, pg_core_1.bigserial)("seq", { mode: "number" }).notNull(),
    prevHash: (0, pg_core_1.text)("prev_hash"),
    entryHash: (0, pg_core_1.text)("entry_hash"),
}, (t) => ({
    auditLogsTimestampIdx: (0, pg_core_1.index)("audit_logs_timestamp_idx").on(t.timestamp),
    auditLogsActorIdIdx: (0, pg_core_1.index)("audit_logs_actor_id_idx").on(t.actorId),
}));
exports.auditLogAnchorsTable = (0, pg_core_1.pgTable)("audit_log_anchors", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    anchoredAt: (0, pg_core_1.timestamp)("anchored_at", { withTimezone: true }).notNull(),
    environment: (0, pg_core_1.text)("environment").notNull(),
    latestSeq: (0, pg_core_1.bigint)("latest_seq", { mode: "number" }).notNull(),
    latestEntryHash: (0, pg_core_1.text)("latest_entry_hash").notNull(),
    previousAnchorHash: (0, pg_core_1.text)("previous_anchor_hash"),
    anchorHash: (0, pg_core_1.text)("anchor_hash").notNull(),
    externalKey: (0, pg_core_1.text)("external_key"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    auditLogAnchorsAnchoredAtIdx: (0, pg_core_1.index)("audit_log_anchors_anchored_at_idx").on(t.anchoredAt),
    auditLogAnchorsLatestSeqIdx: (0, pg_core_1.index)("audit_log_anchors_latest_seq_idx").on(t.latestSeq),
}));
exports.accessReviewsTable = (0, pg_core_1.pgTable)("access_reviews", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    title: (0, pg_core_1.text)("title").notNull(),
    status: (0, pg_core_1.text)("status").notNull().default("open"), // open | completed
    note: (0, pg_core_1.text)("note"),
    createdBy: (0, pg_core_1.uuid)("created_by"),
    createdByEmail: (0, pg_core_1.text)("created_by_email"),
    completedAt: (0, pg_core_1.timestamp)("completed_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
});
exports.accessReviewItemsTable = (0, pg_core_1.pgTable)("access_review_items", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    reviewId: (0, pg_core_1.uuid)("review_id")
        .notNull()
        .references(() => exports.accessReviewsTable.id, { onDelete: "cascade" }),
    userId: (0, pg_core_1.uuid)("user_id").notNull(),
    userEmail: (0, pg_core_1.text)("user_email"),
    userDisplayName: (0, pg_core_1.text)("user_display_name"),
    rolesSnapshot: (0, pg_core_1.text)("roles_snapshot").array().notNull().default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    decision: (0, pg_core_1.text)("decision").notNull().default("pending"), // pending | approved | revoked | flagged
    decidedBy: (0, pg_core_1.uuid)("decided_by"),
    decidedByEmail: (0, pg_core_1.text)("decided_by_email"),
    decidedAt: (0, pg_core_1.timestamp)("decided_at", { withTimezone: true }),
    note: (0, pg_core_1.text)("note"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    reviewIdx: (0, pg_core_1.index)("access_review_items_review_id_idx").on(t.reviewId),
}));
//# sourceMappingURL=audit.js.map