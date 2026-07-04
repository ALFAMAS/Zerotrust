"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeysTable = void 0;
/** DI-1 — api domain tables. */
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const identity_1 = require("./identity");
const organizations_1 = require("./organizations");
exports.apiKeysTable = (0, pg_core_1.pgTable)("api_keys", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => identity_1.usersTable.id, { onDelete: "cascade" }),
    orgId: (0, pg_core_1.uuid)("org_id").references(() => organizations_1.organizationsTable.id, {
        onDelete: "cascade",
    }),
    name: (0, pg_core_1.text)("name").notNull(),
    // "live" or "test" — test-mode keys mirror Stripe: they authenticate but are
    // intended to hit sandbox/non-production data paths and are visually flagged.
    environment: (0, pg_core_1.text)("environment").notNull().default("live"),
    keyHash: (0, pg_core_1.text)("key_hash").notNull().unique(),
    keyPrefix: (0, pg_core_1.text)("key_prefix").notNull(), // first 8 chars for display
    scopes: (0, pg_core_1.text)("scopes").array().notNull().default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    rateLimitPerMinute: (0, pg_core_1.integer)("rate_limit_per_minute"),
    monthlyQuota: (0, pg_core_1.integer)("monthly_quota"),
    expiresAt: (0, pg_core_1.timestamp)("expires_at"),
    lastUsedAt: (0, pg_core_1.timestamp)("last_used_at"),
    revokedAt: (0, pg_core_1.timestamp)("revoked_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
}, (t) => ({
    apiKeysUserIdIdx: (0, pg_core_1.index)("api_keys_user_id_idx").on(t.userId),
}));
//# sourceMappingURL=api.js.map