/** DI-1 — files domain tables. */
import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./identity";
import { organizationsTable } from "./organizations";

export const fileAttachmentsTable = pgTable(
  "file_attachments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => organizationsTable.id, {
      onDelete: "cascade",
    }),
    feature: text("feature").notNull(), // e.g. "support_ticket", "org_settings"
    featureRecordId: text("feature_record_id"), // ID of the record this file is attached to
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    contentType: text("content_type").notNull(),
    storageKey: text("storage_key").notNull(), // S3 key or local path
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    fileAttachmentsUserIdx: index("file_attachments_user_id_idx").on(t.userId),
    fileAttachmentsFeatureIdx: index("file_attachments_feature_idx").on(
      t.feature,
      t.featureRecordId
    ),
  })
);
