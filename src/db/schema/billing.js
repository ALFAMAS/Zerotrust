"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taxExemptionsTable = exports.walletTransactionsTable = exports.walletsTable = exports.usageCountersTable = exports.processedStripeEventsTable = exports.pointsLedgerTable = exports.subscriptionsTable = void 0;
/** DI-1 — billing domain tables. */
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const identity_1 = require("./identity");
const organizations_1 = require("./organizations");
exports.subscriptionsTable = (0, pg_core_1.pgTable)("subscriptions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    // unique: one subscription per user / per org (multiple NULLs allowed)
    userId: (0, pg_core_1.uuid)("user_id")
        .references(() => identity_1.usersTable.id, { onDelete: "set null" })
        .unique(),
    orgId: (0, pg_core_1.uuid)("org_id")
        .references(() => organizations_1.organizationsTable.id, { onDelete: "set null" })
        .unique(),
    stripeCustomerId: (0, pg_core_1.text)("stripe_customer_id").unique(),
    stripeSubscriptionId: (0, pg_core_1.text)("stripe_subscription_id").unique(),
    stripePriceId: (0, pg_core_1.text)("stripe_price_id"),
    stripeProductId: (0, pg_core_1.text)("stripe_product_id"),
    plan: (0, pg_core_1.text)("plan").notNull().default("free"), // "free" | "pro" | "enterprise"
    status: (0, pg_core_1.text)("status").notNull().default("active"), // "active" | "canceled" | "past_due" | "trialing" | "paused"
    currentPeriodStart: (0, pg_core_1.timestamp)("current_period_start"),
    currentPeriodEnd: (0, pg_core_1.timestamp)("current_period_end"),
    cancelAtPeriodEnd: (0, pg_core_1.boolean)("cancel_at_period_end").notNull().default(false),
    trialEnd: (0, pg_core_1.timestamp)("trial_end"),
    canceledAt: (0, pg_core_1.timestamp)("canceled_at"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    version: (0, pg_core_1.integer)("version").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
}, (t) => ({
    subscriptionsStatusIdx: (0, pg_core_1.index)("subscriptions_status_idx").on(t.status),
}));
exports.pointsLedgerTable = (0, pg_core_1.pgTable)("points_ledger", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => identity_1.usersTable.id, { onDelete: "cascade" }),
    points: (0, pg_core_1.integer)("points").notNull(),
    balanceAfter: (0, pg_core_1.integer)("balance_after").notNull(),
    reason: (0, pg_core_1.text)("reason").notNull(),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    pointsLedgerUserCreatedIdx: (0, pg_core_1.index)("points_ledger_user_created_idx").on(t.userId, t.createdAt),
}));
exports.processedStripeEventsTable = (0, pg_core_1.pgTable)("processed_stripe_events", {
    eventId: (0, pg_core_1.text)("event_id").primaryKey(),
    type: (0, pg_core_1.text)("type").notNull(),
    processedAt: (0, pg_core_1.timestamp)("processed_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    processedStripeEventsProcessedIdx: (0, pg_core_1.index)("processed_stripe_events_processed_idx").on(t.processedAt),
}));
exports.usageCountersTable = (0, pg_core_1.pgTable)("usage_counters", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)("user_id").references(() => identity_1.usersTable.id, {
        onDelete: "cascade",
    }),
    orgId: (0, pg_core_1.uuid)("org_id").references(() => organizations_1.organizationsTable.id, {
        onDelete: "cascade",
    }),
    period: (0, pg_core_1.text)("period").notNull(), // "YYYY-MM" billing period bucket
    metric: (0, pg_core_1.text)("metric").notNull(), // "api_calls" | "seats" | "storage_bytes"
    value: (0, pg_core_1.integer)("value").notNull().default(0),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
}, (t) => ({
    // NULLS NOT DISTINCT so the upsert conflicts correctly when userId or
    // orgId is NULL (Postgres 15+)
    uniqUserMetric: (0, pg_core_1.unique)().on(t.userId, t.orgId, t.period, t.metric).nullsNotDistinct(),
}));
exports.walletsTable = (0, pg_core_1.pgTable)("wallets", {
    userId: (0, pg_core_1.uuid)("user_id")
        .primaryKey()
        .references(() => identity_1.usersTable.id, { onDelete: "cascade" }),
    balance: (0, pg_core_1.integer)("balance").notNull().default(0), // in smallest currency unit (cents)
    lifetimeBalance: (0, pg_core_1.integer)("lifetime_balance").notNull().default(0), // total ever earned
    currency: (0, pg_core_1.text)("currency").notNull().default("usd"), // ISO 4217
    stripeCustomerId: (0, pg_core_1.text)("stripe_customer_id"),
    autoTopUp: (0, pg_core_1.boolean)("auto_top_up").notNull().default(false),
    autoTopUpThreshold: (0, pg_core_1.integer)("auto_top_up_threshold"), // trigger when balance below this
    autoTopUpAmount: (0, pg_core_1.integer)("auto_top_up_amount"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
});
exports.walletTransactionsTable = (0, pg_core_1.pgTable)("wallet_transactions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => identity_1.usersTable.id, { onDelete: "cascade" }),
    amount: (0, pg_core_1.integer)("amount").notNull(), // positive = top-up, negative = spend
    balanceAfter: (0, pg_core_1.integer)("balance_after").notNull(),
    type: (0, pg_core_1.text)("type").notNull(), // "top_up" | "spend" | "refund"
    description: (0, pg_core_1.text)("description"),
    stripePaymentIntentId: (0, pg_core_1.text)("stripe_payment_intent_id"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    walletTransactionsUserIdCreatedIdx: (0, pg_core_1.index)("wallet_transactions_user_id_created_idx").on(t.userId, t.createdAt),
    walletTransactionsStripePiUnique: (0, pg_core_1.unique)("wallet_transactions_stripe_pi_unique").on(t.stripePaymentIntentId),
}));
exports.taxExemptionsTable = (0, pg_core_1.pgTable)("tax_exemptions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    orgId: (0, pg_core_1.uuid)("org_id")
        .notNull()
        .references(() => organizations_1.organizationsTable.id, { onDelete: "cascade" }),
    kind: (0, pg_core_1.text)("kind").notNull(), // "vat" | "tax_id" | "reverse_charge"
    taxId: (0, pg_core_1.text)("tax_id").notNull(), // VAT number / tax ID as submitted
    country: (0, pg_core_1.text)("country").notNull(), // ISO-3166 alpha-2
    businessName: (0, pg_core_1.text)("business_name"),
    status: (0, pg_core_1.text)("status").notNull().default("pending"), // "pending" | "verified" | "rejected"
    verifiedAt: (0, pg_core_1.timestamp)("verified_at", { withTimezone: true }),
    submittedBy: (0, pg_core_1.uuid)("submitted_by").references(() => identity_1.usersTable.id, {
        onDelete: "set null",
    }),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    taxExemptionsOrgIdx: (0, pg_core_1.index)("tax_exemptions_org_id_idx").on(t.orgId),
    taxExemptionsOrgTaxIdUnq: (0, pg_core_1.unique)().on(t.orgId, t.taxId),
}));
//# sourceMappingURL=billing.js.map