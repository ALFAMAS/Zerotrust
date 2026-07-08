/** DI-1 — audit domain tables. */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    action: text("action").notNull(),
    actorId: uuid("actor_id"),
    actorEmail: text("actor_email"),
    targetId: text("target_id"),
    targetType: text("target_type"),
    ipAddress: text("ip_address"),
    country: text("country"),
    userAgent: text("user_agent"),
    deviceHash: text("device_hash"),
    sessionId: text("session_id"),
    success: boolean("success").notNull(),
    errorCode: text("error_code"),
    duration: integer("duration"),
    resourceDetails: jsonb("resource_details"),
    riskScore: integer("risk_score"),
    continuousEvalContext: jsonb("continuous_eval_context"),
    metadata: jsonb("metadata"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().default(sql`now()`),
    // Tamper-evidence: monotonic sequence gives a strict total order, and each
    // entry's hash chains to the previous one (entryHash = sha256(prevHash + body)).
    // Editing/deleting/reordering any row breaks the chain — see audit/chain.ts.
    seq: bigserial("seq", { mode: "number" }).notNull(),
    prevHash: text("prev_hash"),
    entryHash: text("entry_hash"),
  },
  (t) => ({
    auditLogsTimestampIdx: index("audit_logs_timestamp_idx").on(t.timestamp),
    auditLogsActorIdIdx: index("audit_logs_actor_id_idx").on(t.actorId),
  })
);

export const auditLogAnchorsTable = pgTable(
  "audit_log_anchors",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    anchoredAt: timestamp("anchored_at", { withTimezone: true }).notNull(),
    environment: text("environment").notNull(),
    latestSeq: bigint("latest_seq", { mode: "number" }).notNull(),
    latestEntryHash: text("latest_entry_hash").notNull(),
    previousAnchorHash: text("previous_anchor_hash"),
    anchorHash: text("anchor_hash").notNull(),
    externalKey: text("external_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    auditLogAnchorsAnchoredAtIdx: index("audit_log_anchors_anchored_at_idx").on(t.anchoredAt),
    auditLogAnchorsLatestSeqIdx: index("audit_log_anchors_latest_seq_idx").on(t.latestSeq),
  })
);

export const accessReviewsTable = pgTable("access_reviews", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  status: text("status").notNull().default("open"), // open | completed
  note: text("note"),
  createdBy: uuid("created_by"),
  createdByEmail: text("created_by_email"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const accessReviewItemsTable = pgTable(
  "access_review_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => accessReviewsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    userEmail: text("user_email"),
    userDisplayName: text("user_display_name"),
    rolesSnapshot: text("roles_snapshot").array().notNull().default(sql`ARRAY[]::text[]`),
    decision: text("decision").notNull().default("pending"), // pending | approved | revoked | flagged
    decidedBy: uuid("decided_by"),
    decidedByEmail: text("decided_by_email"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    reviewIdx: index("access_review_items_review_id_idx").on(t.reviewId),
  })
);
