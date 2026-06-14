import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const usersTable = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  phone: text("phone"),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  roles: text("roles")
    .array()
    .notNull()
    .default(sql`ARRAY['user']::text[]`),
  attributes: jsonb("attributes")
    .notNull()
    .default(sql`'{}'::jsonb`),
  mfa: jsonb("mfa")
    .notNull()
    .default(
      sql`'{"totp":{"enabled":false,"backupCodes":[]},"webauthn":{"enabled":false}}'::jsonb`
    ),
  passkeys: jsonb("passkeys")
    .notNull()
    .default(sql`'[]'::jsonb`),
  oauthProviders: jsonb("oauth_providers")
    .notNull()
    .default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("pending"),
  parentUserId: uuid("parent_user_id"),
  subUserIds: text("sub_user_ids")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  sessionConfig: jsonb("session_config")
    .notNull()
    .default(
      sql`'{"maxDevices":5,"allowedCountries":[],"allowedIpRanges":[],"scheduleRestriction":{"enabled":false,"timezone":"UTC","allowedDays":[],"allowedHoursStart":0,"allowedHoursEnd":23}}'::jsonb`
    ),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const sessionsTable = pgTable("sessions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  tokenId: text("token_id").notNull().unique(),
  deviceFingerprint: jsonb("device_fingerprint")
    .notNull()
    .default(sql`'{}'::jsonb`),
  ipAddress: text("ip_address").notNull(),
  country: text("country"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  isActive: boolean("is_active").notNull().default(true),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedReason: text("revoked_reason"),
  proofOfPossessionKey: text("proof_of_possession_key"),
  continuousEvalResult: jsonb("continuous_eval_result"),
  anomalyFlags: jsonb("anomaly_flags"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const rolesTable = pgTable("roles", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  permissions: jsonb("permissions")
    .notNull()
    .default(sql`'[]'::jsonb`),
  parentRoleId: uuid("parent_role_id"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const jitAccessTable = pgTable("jit_access", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull(),
  reason: text("reason").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: uuid("revoked_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const auditLogsTable = pgTable("audit_logs", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
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
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const refreshTokensTable = pgTable("refresh_tokens", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessionsTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  isRevoked: boolean("is_revoked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const otpsTable = pgTable("otps", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(),
  channel: text("channel").notNull(),
  target: text("target").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const workloadCredentialsTable = pgTable("workload_credentials", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  workloadId: text("workload_id").notNull(),
  workloadSecret: text("workload_secret").notNull(),
  createdBy: uuid("created_by"),
  scopes: text("scopes")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  ttl: integer("ttl"),
  autoRotate: boolean("auto_rotate").notNull().default(false),
  lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isRevoked: boolean("is_revoked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const userBehaviorBaselinesTable = pgTable("user_behavior_baselines", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique(),
  loginHourStats: jsonb("login_hour_stats")
    .notNull()
    .default(sql`'{"mean":12,"variance":25,"count":0}'::jsonb`),
  sessionDurationStats: jsonb("session_duration_stats")
    .notNull()
    .default(sql`'{"mean":1800,"variance":360000,"count":0}'::jsonb`),
  knownIps: text("known_ips")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  knownCountries: text("known_countries")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  knownDevices: text("known_devices")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  totalLogins: integer("total_logins").notNull().default(0),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

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
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedBy: text("updated_by"),
});

export const notificationsTable = pgTable("notifications", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "info" | "success" | "warning" | "error" | "security"
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"), // optional deep-link
  read: boolean("read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const organizationsTable = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  billingEmail: text("billing_email"),
  ownerId: uuid("owner_id").references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationMembersTable = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner | admin | member | viewer | custom
    customRoleId: uuid("custom_role_id"), // populated when role = "custom"
    invitedBy: uuid("invited_by").references(() => usersTable.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniq: unique().on(t.orgId, t.userId),
  })
);

export const organizationInvitesTable = pgTable("organization_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  token: text("token").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => usersTable.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Custom org roles ──────────────────────────────────────────────────────────

export const orgCustomRolesTable = pgTable(
  "org_custom_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    permissions: text("permissions")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({ uniqNamePerOrg: unique().on(t.orgId, t.name) })
);

// ── In-app feedback ───────────────────────────────────────────────────────────

export const feedbackTable = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  orgId: uuid("org_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  type: text("type").notNull(), // "nps" | "csat" | "thumbs"
  score: integer("score"), // 0-10 for NPS, 1/-1 for thumbs
  comment: text("comment"),
  context: text("context"), // page or feature slug where widget was shown
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── API Keys ──────────────────────────────────────────────────────────────────

export const apiKeysTable = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(), // first 8 chars for display
  scopes: text("scopes")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Subscriptions ─────────────────────────────────────────────────────────────

export const subscriptionsTable = pgTable("subscriptions", {
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Security events (account takeover detection) ──────────────────────────────

export const securityEventsTable = pgTable("security_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "password_reset" | "email_change" | "mfa_disabled" | ...
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Usage counters (per billing period) ───────────────────────────────────────

export const usageCountersTable = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
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

// ── Feature flags ─────────────────────────────────────────────────────────────

export const featureFlagsTable = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(false),
  // Optional per-user rollout: list of user IDs the flag is force-enabled for
  enabledForUsers: text("enabled_for_users")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  // Percentage rollout 0-100 (applies when enabled = false)
  rolloutPercent: integer("rollout_percent").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
