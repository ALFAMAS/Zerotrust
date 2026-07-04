"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileAttachmentsTable = void 0;
/** DI-1 — files domain tables. */
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const identity_1 = require("./identity");
const organizations_1 = require("./organizations");
exports.fileAttachmentsTable = (0, pg_core_1.pgTable)("file_attachments", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => identity_1.usersTable.id, { onDelete: "cascade" }),
    orgId: (0, pg_core_1.uuid)("org_id").references(() => organizations_1.organizationsTable.id, {
        onDelete: "cascade",
    }),
    feature: (0, pg_core_1.text)("feature").notNull(), // e.g. "support_ticket", "org_settings"
    featureRecordId: (0, pg_core_1.text)("feature_record_id"), // ID of the record this file is attached to
    fileName: (0, pg_core_1.text)("file_name").notNull(),
    fileSize: (0, pg_core_1.integer)("file_size").notNull(),
    contentType: (0, pg_core_1.text)("content_type").notNull(),
    storageKey: (0, pg_core_1.text)("storage_key").notNull(), // S3 key or local path
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    fileAttachmentsUserIdx: (0, pg_core_1.index)("file_attachments_user_id_idx").on(t.userId),
    fileAttachmentsFeatureIdx: (0, pg_core_1.index)("file_attachments_feature_idx").on(t.feature, t.featureRecordId),
}));
//# sourceMappingURL=files.js.map