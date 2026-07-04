"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackTable = exports.emailSuppressionsTable = exports.pushSubscriptionsTable = exports.notificationsTable = exports.saasSettingsTable = void 0;
/** DI-1 — platform domain tables. */
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const identity_1 = require("./identity");
const organizations_1 = require("./organizations");
exports.saasSettingsTable = (0, pg_core_1.pgTable)("saas_settings", {
    id: (0, pg_core_1.text)("id").primaryKey().default("saas-settings"),
    emailPasswordEnabled: (0, pg_core_1.boolean)("email_password_enabled").notNull().default(true),
    googleOAuthEnabled: (0, pg_core_1.boolean)("google_oauth_enabled").notNull().default(false),
    githubOAuthEnabled: (0, pg_core_1.boolean)("github_oauth_enabled").notNull().default(false),
    magicLinkEnabled: (0, pg_core_1.boolean)("magic_link_enabled").notNull().default(true),
    passkeyEnabled: (0, pg_core_1.boolean)("passkey_enabled").notNull().default(true),
    totpEnabled: (0, pg_core_1.boolean)("totp_enabled").notNull().default(true),
    emailOtpEnabled: (0, pg_core_1.boolean)("email_otp_enabled").notNull().default(true),
    smsOtpEnabled: (0, pg_core_1.boolean)("sms_otp_enabled").notNull().default(false),
    requireMfaForAll: (0, pg_core_1.boolean)("require_mfa_for_all").notNull().default(false),
    sessionTTLSeconds: (0, pg_core_1.integer)("session_ttl_seconds").notNull().default(3600),
    maxConcurrentSessions: (0, pg_core_1.integer)("max_concurrent_sessions").notNull().default(5),
    accountLockoutEnabled: (0, pg_core_1.boolean)("account_lockout_enabled").notNull().default(true),
    accountLockoutThreshold: (0, pg_core_1.integer)("account_lockout_threshold").notNull().default(5),
    accountLockoutDurationMinutes: (0, pg_core_1.integer)("account_lockout_duration_minutes").notNull().default(30),
    registrationEnabled: (0, pg_core_1.boolean)("registration_enabled").notNull().default(true),
    requireEmailVerification: (0, pg_core_1.boolean)("require_email_verification").notNull().default(false),
    allowedEmailDomains: (0, pg_core_1.text)("allowed_email_domains")
        .array()
        .notNull()
        .default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    appName: (0, pg_core_1.text)("app_name").notNull().default("My SaaS App"),
    appUrl: (0, pg_core_1.text)("app_url").notNull().default("http://localhost:3000"),
    supportEmail: (0, pg_core_1.text)("support_email").notNull().default(""),
    logoUrl: (0, pg_core_1.text)("logo_url").notNull().default(""),
    version: (0, pg_core_1.integer)("version").notNull().default(0),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    updatedBy: (0, pg_core_1.text)("updated_by"),
});
exports.notificationsTable = (0, pg_core_1.pgTable)("notifications", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => identity_1.usersTable.id, { onDelete: "cascade" }),
    type: (0, pg_core_1.text)("type").notNull(), // "info" | "success" | "warning" | "error" | "security"
    title: (0, pg_core_1.text)("title").notNull(),
    body: (0, pg_core_1.text)("body").notNull(),
    link: (0, pg_core_1.text)("link"), // optional deep-link
    read: (0, pg_core_1.boolean)("read").notNull().default(false),
    readAt: (0, pg_core_1.timestamp)("read_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    notificationsUserIdReadIdx: (0, pg_core_1.index)("notifications_user_id_read_idx").on(t.userId, t.read),
}));
exports.pushSubscriptionsTable = (0, pg_core_1.pgTable)("push_subscriptions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => identity_1.usersTable.id, { onDelete: "cascade" }),
    endpoint: (0, pg_core_1.text)("endpoint").notNull().unique(),
    p256dh: (0, pg_core_1.text)("p256dh").notNull(),
    auth: (0, pg_core_1.text)("auth").notNull(),
    userAgent: (0, pg_core_1.text)("user_agent"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    lastUsedAt: (0, pg_core_1.timestamp)("last_used_at", { withTimezone: true }),
});
exports.emailSuppressionsTable = (0, pg_core_1.pgTable)("email_suppressions", {
    email: (0, pg_core_1.text)("email").primaryKey(),
    reason: (0, pg_core_1.text)("reason").notNull(), // bounce | complaint | manual | unsubscribe
    detail: (0, pg_core_1.text)("detail"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
exports.feedbackTable = (0, pg_core_1.pgTable)("feedback", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)("user_id").references(() => identity_1.usersTable.id, {
        onDelete: "set null",
    }),
    orgId: (0, pg_core_1.uuid)("org_id").references(() => organizations_1.organizationsTable.id, {
        onDelete: "set null",
    }),
    type: (0, pg_core_1.text)("type").notNull(), // "nps" | "csat" | "thumbs"
    score: (0, pg_core_1.integer)("score"), // 0-10 for NPS, 1/-1 for thumbs
    comment: (0, pg_core_1.text)("comment"),
    context: (0, pg_core_1.text)("context"), // page or feature slug where widget was shown
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
//# sourceMappingURL=platform.js.map