/** DI-1 — platform domain tables. */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./identity";
import { organizationsTable } from "./organizations";

export const saasSettingsTable = pgTable("saas_settings", {
  id: text("id").primaryKey().default("saas-settings"),
  emailPasswordEnabled: boolean("email_password_enabled").notNull().default(true),
  googleOAuthEnabled: boolean("google_oauth_enabled").notNull().default(false),
  githubOAuthEnabled: boolean("github_oauth_enabled").notNull().default(false),
  magicLinkEnabled: boolean("magic_link_enabled").notNull().default(true),
  passkeyEnabled: boolean("passkey_enabled").notNull().default(true),
  totpEnabled: boolean("totp_enabled").notNull().default(true),
  emailOtpEnabled: boolean("email_otp_enabled").notNull().default(true),
  smsOtpEnabled: boolean("sms_otp_enabled").notNull().default(false),
  requireMfaForAll: boolean("require_mfa_for_all").notNull().default(false),
  sessionTTLSeconds: integer("session_ttl_seconds").notNull().default(3600),
  maxConcurrentSessions: integer("max_concurrent_sessions").notNull().default(5),
  accountLockoutEnabled: boolean("account_lockout_enabled").notNull().default(true),
  accountLockoutThreshold: integer("account_lockout_threshold").notNull().default(5),
  accountLockoutDurationMinutes: integer("account_lockout_duration_minutes").notNull().default(30),
  registrationEnabled: boolean("registration_enabled").notNull().default(true),
  requireEmailVerification: boolean("require_email_verification").notNull().default(false),
  allowedEmailDomains: text("allowed_email_domains")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  appName: text("app_name").notNull().default("My SaaS App"),
  appUrl: text("app_url").notNull().default("http://localhost:3000"),
  supportEmail: text("support_email").notNull().default(""),
  logoUrl: text("logo_url").notNull().default(""),
  version: integer("version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedBy: text("updated_by"),
});

export const notificationsTable = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "info" | "success" | "warning" | "error" | "security"
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"), // optional deep-link
    read: boolean("read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    notificationsUserIdReadIdx: index("notifications_user_id_read_idx").on(t.userId, t.read),
  })
);

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const emailSuppressionsTable = pgTable("email_suppressions", {
  email: text("email").primaryKey(),
  reason: text("reason").notNull(), // bounce | complaint | manual | unsubscribe
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const feedbackTable = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  orgId: uuid("org_id").references(() => organizationsTable.id, {
    onDelete: "set null",
  }),
  type: text("type").notNull(), // "nps" | "csat" | "thumbs"
  score: integer("score"), // 0-10 for NPS, 1/-1 for thumbs
  comment: text("comment"),
  context: text("context"), // page or feature slug where widget was shown
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
