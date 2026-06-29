import { sql } from "drizzle-orm";
import {
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
import type { OidcConfig, SamlConfig, TenantSettings } from "../models/tenant.model";

/** Per-organization branding overrides (white-label). */
export interface OrgBranding {
  appName?: string;
  brandColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  /** When true, hide all "Powered by zerotrust" badges. */
  hidePoweredBy?: boolean;
  /** Custom email "from" address (must be verified via custom email domain). */
  emailFromAddress?: string;
  /** Custom email domain (e.g. noreply@theirdomain.com). */
  emailDomain?: string;
  /** Custom login page URL — orgs can host their own login page. */
  customLoginUrl?: string;
}

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  phone: text("phone"),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  // Preferred UI/email locale (BCP-47 base tag). Captured from Accept-Language
  // at registration; editable via PATCH /auth/me. Drives localized emails.
  locale: text("locale").notNull().default("en"),
  // Legal hold: when true, this account's data is exempt from retention
  // auto-purge (e.g. audit logs are preserved for legal defensibility).
  legalHold: boolean("legal_hold").notNull().default(false),
  legalHoldReason: text("legal_hold_reason"),
  legalHoldAt: timestamp("legal_hold_at", { withTimezone: true }),
  roles: text("roles").array().notNull().default(sql`ARRAY['user']::text[]`),
  attributes: jsonb("attributes").notNull().default(sql`'{}'::jsonb`),
  mfa: jsonb("mfa")
    .notNull()
    .default(
      sql`'{"totp":{"enabled":false,"backupCodes":[]},"webauthn":{"enabled":false}}'::jsonb`
    ),
  passkeys: jsonb("passkeys").notNull().default(sql`'[]'::jsonb`),
  oauthProviders: jsonb("oauth_providers").notNull().default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("pending"),
  parentUserId: uuid("parent_user_id"),
  subUserIds: text("sub_user_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  sessionConfig: jsonb("session_config")
    .notNull()
    .default(
      sql`'{"maxDevices":5,"allowedCountries":[],"allowedIpRanges":[],"scheduleRestriction":{"enabled":false,"timezone":"UTC","allowedDays":[],"allowedHoursStart":0,"allowedHoursEnd":23}}'::jsonb`
    ),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
  // Customer segment tag — used by CS/success teams to categorize accounts.
  customerSegment: text("customer_segment"), // "champion" | "at_risk" | "expansion" | "new" | null
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const sessionsTable = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenId: text("token_id").notNull().unique(),
    deviceFingerprint: jsonb("device_fingerprint").notNull().default(sql`'{}'::jsonb`),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    sessionsUserIdIsActiveIdx: index("sessions_user_id_is_active_idx").on(t.userId, t.isActive),
    sessionsExpiresAtIsActiveIdx: index("sessions_expires_at_is_active_idx").on(
      t.expiresAt,
      t.isActive
    ),
  })
);

export const rolesTable = pgTable("roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  permissions: jsonb("permissions").notNull().default(sql`'[]'::jsonb`),
  parentRoleId: uuid("parent_role_id"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const jitAccessTable = pgTable("jit_access", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull(),
  reason: text("reason").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().default(sql`now()`),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: uuid("revoked_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

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
  })
);

// ── Access reviews (SOC 2 CC6: periodic review of privileged access) ──────────
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

export const refreshTokensTable = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    refreshTokensUserRevokedExpiresIdx: index("refresh_tokens_user_revoked_expires_idx").on(
      t.userId,
      t.isRevoked,
      t.expiresAt
    ),
    refreshTokensSessionIdIdx: index("refresh_tokens_session_id_idx").on(t.sessionId),
  })
);

export const otpsTable = pgTable("otps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(),
  channel: text("channel").notNull(),
  target: text("target").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Short-lived OAuth exchange codes. After the OAuth callback creates a session,
// the tokens are stored here under a one-time code that the frontend redeems
// via POST /oauth/exchange. This avoids putting tokens in the URL.
export const oauthExchangeCodesTable = pgTable("oauth_exchange_codes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  userId: uuid("user_id").notNull(),
  sessionId: uuid("session_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Cross-tenant JIT (just-in-time) privilege-escalation requests. Durable so
// approvals + grants survive restarts and provide an audit trail.
export const crossTenantJITRequestsTable = pgTable("cross_tenant_jit_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  requestorUserId: uuid("requestor_user_id").notNull(),
  requestorTenantId: text("requestor_tenant_id").notNull().default("default"),
  targetTenantId: text("target_tenant_id").notNull(),
  targetResource: text("target_resource").notNull(),
  justification: text("justification").notNull(),
  ttlSeconds: integer("ttl_seconds").notNull(),
  // pending | approved | denied | expired
  status: text("status").notNull().default("pending"),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Trusted federation (RFC 8693 token-exchange) providers. Durable registry so
// providers configured via the admin UI persist across restarts.
export const userBehaviorBaselinesTable = pgTable("user_behavior_baselines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
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
  knownIps: text("known_ips").array().notNull().default(sql`ARRAY[]::text[]`),
  knownCountries: text("known_countries").array().notNull().default(sql`ARRAY[]::text[]`),
  knownDevices: text("known_devices").array().notNull().default(sql`ARRAY[]::text[]`),
  totalLogins: integer("total_logins").notNull().default(0),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
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

export const organizationsTable = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logoUrl: text("logo_url"),
    billingEmail: text("billing_email"),
    ownerId: uuid("owner_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    // Multi-tenant enterprise: custom domain, branding overrides, data residency.
    customDomain: text("custom_domain"),
    branding: jsonb("branding").$type<OrgBranding>(),
    storageRegion: text("storage_region").notNull().default("us"),
    // References the tenant this org belongs to (for multi-tenant platform).
    tenantId: uuid("tenant_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    organizationsCustomDomainIdx: index("organizations_custom_domain_idx").on(t.customDomain),
    organizationsStorageRegionIdx: index("organizations_storage_region_idx").on(t.storageRegion),
    organizationsTenantIdx: index("organizations_tenant_idx").on(t.tenantId),
  })
);

export const orgSecurityPoliciesTable = pgTable("org_security_policies", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  requirePasskeyAttestation: boolean("require_passkey_attestation").notNull().default(false),
  requireHardwarePasskey: boolean("require_hardware_passkey").notNull().default(false),
  allowedPasskeyAaguids: text("allowed_passkey_aaguids")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  deniedPasskeyAaguids: text("denied_passkey_aaguids")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  // IPv4 CIDR allowlist. Empty = no restriction; non-empty restricts org-scoped
  // API access to callers whose IP matches one of the ranges.
  ipAllowlist: text("ip_allowlist").array().notNull().default(sql`ARRAY[]::text[]`),
  // ── Session & device policy (enforced in the auth middleware) ──
  // All numeric limits use 0 = unlimited.
  maxSessionAgeSeconds: integer("max_session_age_seconds").notNull().default(0),
  idleTimeoutSeconds: integer("idle_timeout_seconds").notNull().default(0),
  maxConcurrentSessions: integer("max_concurrent_sessions").notNull().default(0),
  // ISO 3166-1 alpha-2 codes a member's session may originate from. Empty = any.
  allowedCountries: text("allowed_countries").array().notNull().default(sql`ARRAY[]::text[]`),
  // When true, org members must use a registered trusted device to access the org.
  requireTrustedDevices: boolean("require_trusted_devices").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: uuid("updated_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
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
    invitedBy: uuid("invited_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniq: unique().on(t.orgId, t.userId),
    organizationMembersUserIdIdx: index("organization_members_user_id_idx").on(t.userId),
    organizationMembersOrgIdRoleIdx: index("organization_members_org_id_role_idx").on(
      t.orgId,
      t.role
    ),
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
  invitedBy: uuid("invited_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
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
    permissions: text("permissions").array().notNull().default(sql`ARRAY[]::text[]`),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({ uniqNamePerOrg: unique().on(t.orgId, t.name) })
);

// ── In-app feedback ───────────────────────────────────────────────────────────

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

// ── Email suppression list ──────────────────────────────────────────────────────
// Addresses we must stop emailing (hard bounces, spam complaints, manual). The
// central sendEmail() path skips any recipient listed here to protect sender
// reputation for the BullMQ email queue.
export const emailSuppressionsTable = pgTable("email_suppressions", {
  email: text("email").primaryKey(),
  reason: text("reason").notNull(), // bounce | complaint | manual | unsubscribe
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Support tickets ─────────────────────────────────────────────────────────────
// Lightweight, self-hosted support inbox (alternative to a third-party tool).
// A ticket is a threaded conversation between a user and support agents.
export const supportTicketsTable = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").references(() => organizationsTable.id, {
    onDelete: "set null",
  }),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("open"), // open | pending | closed
  priority: text("priority").notNull().default("normal"), // low | normal | high
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const supportTicketMessagesTable = pgTable("support_ticket_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  authorRole: text("author_role").notNull(), // user | agent
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── API Keys ──────────────────────────────────────────────────────────────────

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

// ── Subscriptions ─────────────────────────────────────────────────────────────

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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    subscriptionsStatusIdx: index("subscriptions_status_idx").on(t.status),
  })
);

// ── Processed Stripe events (webhook idempotency) ─────────────────────────────
// Records every Stripe event id we have already applied so a redelivered or
// replayed webhook is a no-op (CWE-/ checklist #94: idempotency on money paths).
// The event id is Stripe's globally-unique `evt_...` identifier and is the
// primary key, so a duplicate insert conflicts and is skipped atomically.
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

// ── Tenants (multi-tenancy: CRUD + per-tenant SSO config + plans) ──────────────

export const tenantsTable = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("active"),
  plan: text("plan").notNull().default("free"),
  settings: jsonb("settings")
    .$type<TenantSettings>()
    .notNull()
    .default(
      sql`'{"allowedDomains":[],"enforceSSO":false,"mfaRequired":false,"sessionTTL":3600,"maxUsers":100,"allowedCountries":[]}'::jsonb`
    ),
  oidcConfig: jsonb("oidc_config").$type<OidcConfig>(),
  samlConfig: jsonb("saml_config").$type<SamlConfig>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// ── Feature flags ─────────────────────────────────────────────────────────────

// Web Push subscriptions (RFC 8030/8291). One row per browser/device push
// endpoint a user has opted into. Used by the notification fan-out to deliver
// push even when no SSE connection is open (e.g. the PWA is closed).
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

// ── Login streaks ──────────────────────────────────────────────────────────────
// Tracks daily login streak per user with a 1-day grace period.

export const streaksTable = pgTable("streaks", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastLoginDate: text("last_login_date"), // ISO date string YYYY-MM-DD
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// ── Points ledger ──────────────────────────────────────────────────────────────
// Append-only log of every points change for a user. The running balance is
// computed by summing rows — this design gives us a full audit trail and makes
// it trivial to build a points history page.

export const pointsLedgerTable = pgTable(
  "points_ledger",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(), // positive = earned, negative = spent
    balance: integer("balance").notNull(), // running balance after this entry
    reason: text("reason").notNull(), // "daily_login" | "referral" | "achievement" | "redemption" | …
    description: text("description"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    pointsLedgerUserIdCreatedIdx: index("points_ledger_user_id_created_idx").on(
      t.userId,
      t.createdAt
    ),
  })
);

// ── Achievements ──────────────────────────────────────────────────────────────
// Tracks which achievements a user has unlocked and when.

export const achievementsTable = pgTable(
  "achievements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // "first_login" | "power_user" | "early_adopter" | …
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    achievementsUserKeyUnq: unique().on(t.userId, t.key),
    achievementsUserIdIdx: index("achievements_user_id_idx").on(t.userId),
  })
);

// ── Trusted devices per org ──────────────────────────────────────────────────

export const trustedDevicesTable = pgTable(
  "trusted_devices",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    deviceName: text("device_name").notNull(),
    deviceFingerprint: text("device_fingerprint").notNull(),
    registeredBy: uuid("registered_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    trustedDevicesOrgIdIdx: index("trusted_devices_org_id_idx").on(t.orgId),
    trustedDevicesFingerprintUnq: unique().on(t.orgId, t.deviceFingerprint),
  })
);

// ── Webhook delivery logs (durable) ───────────────────────────────────────────

export const webhookDeliveryLogsTable = pgTable(
  "webhook_delivery_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    webhookId: uuid("webhook_id").notNull(),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    statusCode: integer("status_code"),
    responseBody: text("response_body"),
    errorMessage: text("error_message"),
    attempt: integer("attempt").notNull().default(1),
    duration: integer("duration"),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    webhookDeliveryLogsWebhookIdIdx: index("webhook_delivery_logs_webhook_id_idx").on(t.webhookId),
    webhookDeliveryLogsCreatedIdx: index("webhook_delivery_logs_created_idx").on(t.createdAt),
  })
);

// ── Passkeys (dedicated table - N+1 fix) ──────────────────────────────────────

export const passkeysTable = pgTable(
  "passkeys",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull().unique(),
    publicKey: text("public_key").notNull(),
    signCount: integer("sign_count").notNull().default(0),
    deviceType: text("device_type"),
    backedUp: boolean("backed_up").notNull().default(false),
    transports: text("transports").array().notNull().default(sql`ARRAY[]::text[]`),
    aaguid: text("aaguid"),
    deviceName: text("device_name"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    passkeysUserIdIdx: index("passkeys_user_id_idx").on(t.userId),
    passkeysCredentialIdIdx: index("passkeys_credential_id_idx").on(t.credentialId),
  })
);

// ── File attachments ─────────────────────────────────────────────────────────

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

// ── Tax exemptions / VAT IDs (org-level) ──────────────────────────────────────

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

// ── Wallet ─────────────────────────────────────────────────────────────────────
// Per-user wallet with balance, currency, and Stripe top-up integration.

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
    type: text("type").notNull(), // "top_up" | "spend" | "refund" | "referral_credit" | "tier_bonus"
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
  })
);

// ── Tier system ───────────────────────────────────────────────────────────────
// Bronze / Silver / Gold / Platinum tiers with perks.

export const tiersTable = pgTable("tiers", {
  key: text("key").primaryKey(), // "bronze" | "silver" | "gold" | "platinum"
  name: text("name").notNull(),
  description: text("description"),
  minPoints: integer("min_points").notNull(), // points required to reach this tier
  multiplier: integer("multiplier").notNull().default(100), // points earning multiplier (100 = 1x)
  perks: jsonb("perks").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  color: text("color"), // hex color for badge display
  icon: text("icon"), // lucide icon name
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const userTiersTable = pgTable("user_tiers", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  tierKey: text("tier_key")
    .notNull()
    .references(() => tiersTable.key, { onDelete: "restrict" }),
  achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull().default(sql`now()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// ── Redemption catalog ────────────────────────────────────────────────────────
// Items users can redeem with points.

export const redemptionsCatalogTable = pgTable("redemptions_catalog", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // "account_credit_5" | "feature_unlock" | "extended_trial" | "swag_code"
  name: text("name").notNull(),
  description: text("description"),
  cost: integer("cost").notNull(), // points required
  type: text("type").notNull(), // "account_credit" | "feature_unlock" | "extended_trial" | "swag"
  value: jsonb("value").$type<{
    cents?: number;
    days?: number;
    feature?: string;
    code?: string;
  }>(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const redemptionsTable = pgTable(
  "redemptions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => redemptionsCatalogTable.id, { onDelete: "restrict" }),
    pointsSpent: integer("points_spent").notNull(),
    status: text("status").notNull().default("completed"), // "completed" | "pending" | "failed"
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    redemptionsUserIdCreatedIdx: index("redemptions_user_id_created_idx").on(t.userId, t.createdAt),
  })
);

// ── Referrals ─────────────────────────────────────────────────────────────────
// Unique referral links, tracking, and reward attribution.

export const referralsTable = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    referrerUserId: uuid("referrer_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(), // short signed link code
    slug: text("slug").notNull().unique(), // URL-friendly slug
    clicks: integer("clicks").notNull().default(0),
    signups: integer("signups").notNull().default(0),
    conversions: integer("conversions").notNull().default(0), // signed up + paid
    rewardsEarned: integer("rewards_earned").notNull().default(0), // points earned from this link
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    referralsReferrerIdx: index("referrals_referrer_idx").on(t.referrerUserId),
    referralsCodeIdx: index("referrals_code_idx").on(t.code),
  })
);

export const referralTrackingTable = pgTable(
  "referral_tracking",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    referralId: uuid("referral_id")
      .notNull()
      .references(() => referralsTable.id, { onDelete: "cascade" }),
    referredUserId: uuid("referred_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    status: text("status").notNull().default("clicked"), // "clicked" | "signed_up" | "converted" | "rewarded"
    clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().default(sql`now()`),
    signedUpAt: timestamp("signed_up_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    referralTrackingReferralIdx: index("referral_tracking_referral_idx").on(t.referralId),
    referralTrackingReferredIdx: index("referral_tracking_referred_idx").on(t.referredUserId),
  })
);

// ── SOC 2 controls ────────────────────────────────────────────────────────────
// Documented control implementation evidence for SOC 2 Type II audits.

export const soc2ControlsTable = pgTable("soc2_controls", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  controlId: text("control_id").notNull().unique(), // "CC6.1" | "A1.2" | ...
  category: text("category").notNull(), // "CC6" | "A1" | "C1" | "P"
  title: text("title").notNull(),
  description: text("description"),
  implementation: text("implementation").notNull(), // what we do
  evidence: text("evidence"), // where proof lives
  status: text("status").notNull().default("implemented"), // "implemented" | "partial" | "planned"
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// ── Risk assessment ───────────────────────────────────────────────────────────
// Annual risk register with treatment plans.

export const riskAssessmentsTable = pgTable(
  "risk_assessments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    year: integer("year").notNull(), // assessment year
    riskId: text("risk_id").notNull(), // "R-001" | "R-002" | ...
    category: text("category").notNull(), // "security" | "availability" | "compliance" | "financial"
    title: text("title").notNull(),
    description: text("description"),
    likelihood: integer("likelihood").notNull(), // 1-5
    impact: integer("impact").notNull(), // 1-5
    riskScore: integer("risk_score").notNull(), // likelihood * impact
    treatment: text("treatment").notNull(), // "mitigate" | "accept" | "transfer" | "avoid"
    mitigation: text("mitigation"),
    owner: text("owner"),
    status: text("status").notNull().default("open"), // "open" | "mitigated" | "closed"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    riskAssessmentsYearIdx: index("risk_assessments_year_idx").on(t.year),
    riskAssessmentsRiskIdUnq: unique().on(t.year, t.riskId),
  })
);
