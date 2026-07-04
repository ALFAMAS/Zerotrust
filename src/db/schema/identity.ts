/** DI-1 — identity domain tables. */
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
  version: integer("version").notNull().default(0),
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

export const otpsTable = pgTable(
  "otps",
  {
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
  },
  (t) => ({
    otpsUserIdTypeIdx: index("otps_user_id_type_idx").on(t.userId, t.type),
  })
);

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
