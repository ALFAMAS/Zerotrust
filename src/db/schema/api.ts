/** DI-1 — api domain tables. */
import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./identity";
import { organizationsTable } from "./organizations";

export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => organizationsTable.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    // "live" or "test" — test-mode keys mirror Stripe: they authenticate but are
    // intended to hit sandbox/non-production data paths and are visually flagged.
    environment: text("environment").notNull().default("live"),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(), // first 8 chars for display
    scopes: text("scopes").array().notNull().default(sql`ARRAY[]::text[]`),
    rateLimitPerMinute: integer("rate_limit_per_minute"),
    monthlyQuota: integer("monthly_quota"),
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    apiKeysUserIdIdx: index("api_keys_user_id_idx").on(t.userId),
  })
);
