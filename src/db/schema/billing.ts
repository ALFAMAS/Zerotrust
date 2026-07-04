/** DI-1 — billing domain tables. */
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
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./identity";
import { organizationsTable } from "./organizations";

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // unique: one subscription per user / per org (multiple NULLs allowed)
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "set null" })
      .unique(),
    orgId: uuid("org_id")
      .references(() => organizationsTable.id, { onDelete: "set null" })
      .unique(),
    stripeCustomerId: text("stripe_customer_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripePriceId: text("stripe_price_id"),
    stripeProductId: text("stripe_product_id"),
    plan: text("plan").notNull().default("free"), // "free" | "pro" | "enterprise"
    status: text("status").notNull().default("active"), // "active" | "canceled" | "past_due" | "trialing" | "paused"
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    trialEnd: timestamp("trial_end"),
    canceledAt: timestamp("canceled_at"),
    metadata: jsonb("metadata"),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    subscriptionsStatusIdx: index("subscriptions_status_idx").on(t.status),
  })
);

export const pointsLedgerTable = pgTable(
  "points_ledger",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reason: text("reason").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    pointsLedgerUserCreatedIdx: index("points_ledger_user_created_idx").on(t.userId, t.createdAt),
  })
);

export const processedStripeEventsTable = pgTable(
  "processed_stripe_events",
  {
    eventId: text("event_id").primaryKey(),
    type: text("type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    processedStripeEventsProcessedIdx: index("processed_stripe_events_processed_idx").on(
      t.processedAt
    ),
  })
);

export const usageCountersTable = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    orgId: uuid("org_id").references(() => organizationsTable.id, {
      onDelete: "cascade",
    }),
    period: text("period").notNull(), // "YYYY-MM" billing period bucket
    metric: text("metric").notNull(), // "api_calls" | "seats" | "storage_bytes"
    value: integer("value").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // NULLS NOT DISTINCT so the upsert conflicts correctly when userId or
    // orgId is NULL (Postgres 15+)
    uniqUserMetric: unique().on(t.userId, t.orgId, t.period, t.metric).nullsNotDistinct(),
  })
);

export const walletsTable = pgTable("wallets", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0), // in smallest currency unit (cents)
  lifetimeBalance: integer("lifetime_balance").notNull().default(0), // total ever earned
  currency: text("currency").notNull().default("usd"), // ISO 4217
  stripeCustomerId: text("stripe_customer_id"),
  autoTopUp: boolean("auto_top_up").notNull().default(false),
  autoTopUpThreshold: integer("auto_top_up_threshold"), // trigger when balance below this
  autoTopUpAmount: integer("auto_top_up_amount"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const walletTransactionsTable = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(), // positive = top-up, negative = spend
    balanceAfter: integer("balance_after").notNull(),
    type: text("type").notNull(), // "top_up" | "spend" | "refund"
    description: text("description"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    walletTransactionsUserIdCreatedIdx: index("wallet_transactions_user_id_created_idx").on(
      t.userId,
      t.createdAt
    ),
    walletTransactionsStripePiUnique: unique("wallet_transactions_stripe_pi_unique").on(
      t.stripePaymentIntentId
    ),
  })
);

export const taxExemptionsTable = pgTable(
  "tax_exemptions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "vat" | "tax_id" | "reverse_charge"
    taxId: text("tax_id").notNull(), // VAT number / tax ID as submitted
    country: text("country").notNull(), // ISO-3166 alpha-2
    businessName: text("business_name"),
    status: text("status").notNull().default("pending"), // "pending" | "verified" | "rejected"
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    submittedBy: uuid("submitted_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    taxExemptionsOrgIdx: index("tax_exemptions_org_id_idx").on(t.orgId),
    taxExemptionsOrgTaxIdUnq: unique().on(t.orgId, t.taxId),
  })
);
