"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityEventsTable = exports.passkeysTable = exports.userBehaviorBaselinesTable = exports.oauthExchangeCodesTable = exports.otpsTable = exports.refreshTokensTable = exports.jitAccessTable = exports.rolesTable = exports.sessionsTable = exports.usersTable = void 0;
/** DI-1 — identity domain tables. */
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
exports.usersTable = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    email: (0, pg_core_1.text)("email").notNull().unique(),
    username: (0, pg_core_1.text)("username").unique(),
    passwordHash: (0, pg_core_1.text)("password_hash"),
    phone: (0, pg_core_1.text)("phone"),
    displayName: (0, pg_core_1.text)("display_name").notNull(),
    avatarUrl: (0, pg_core_1.text)("avatar_url"),
    // Preferred UI/email locale (BCP-47 base tag). Captured from Accept-Language
    // at registration; editable via PATCH /auth/me. Drives localized emails.
    locale: (0, pg_core_1.text)("locale").notNull().default("en"),
    // Legal hold: when true, this account's data is exempt from retention
    // auto-purge (e.g. audit logs are preserved for legal defensibility).
    legalHold: (0, pg_core_1.boolean)("legal_hold").notNull().default(false),
    legalHoldReason: (0, pg_core_1.text)("legal_hold_reason"),
    legalHoldAt: (0, pg_core_1.timestamp)("legal_hold_at", { withTimezone: true }),
    roles: (0, pg_core_1.text)("roles").array().notNull().default((0, drizzle_orm_1.sql) `ARRAY['user']::text[]`),
    attributes: (0, pg_core_1.jsonb)("attributes").notNull().default((0, drizzle_orm_1.sql) `'{}'::jsonb`),
    mfa: (0, pg_core_1.jsonb)("mfa")
        .notNull()
        .default((0, drizzle_orm_1.sql) `'{"totp":{"enabled":false,"backupCodes":[]},"webauthn":{"enabled":false}}'::jsonb`),
    passkeys: (0, pg_core_1.jsonb)("passkeys").notNull().default((0, drizzle_orm_1.sql) `'[]'::jsonb`),
    oauthProviders: (0, pg_core_1.jsonb)("oauth_providers").notNull().default((0, drizzle_orm_1.sql) `'[]'::jsonb`),
    status: (0, pg_core_1.text)("status").notNull().default("pending"),
    parentUserId: (0, pg_core_1.uuid)("parent_user_id"),
    subUserIds: (0, pg_core_1.text)("sub_user_ids").array().notNull().default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    sessionConfig: (0, pg_core_1.jsonb)("session_config")
        .notNull()
        .default((0, drizzle_orm_1.sql) `'{"maxDevices":5,"allowedCountries":[],"allowedIpRanges":[],"scheduleRestriction":{"enabled":false,"timezone":"UTC","allowedDays":[],"allowedHoursStart":0,"allowedHoursEnd":23}}'::jsonb`),
    lastLoginAt: (0, pg_core_1.timestamp)("last_login_at", { withTimezone: true }),
    emailVerifiedAt: (0, pg_core_1.timestamp)("email_verified_at", { withTimezone: true }),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    // Customer segment tag — used by CS/success teams to categorize accounts.
    customerSegment: (0, pg_core_1.text)("customer_segment"), // "champion" | "at_risk" | "expansion" | "new" | null
    version: (0, pg_core_1.integer)("version").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
});
exports.sessionsTable = (0, pg_core_1.pgTable)("sessions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.usersTable.id, { onDelete: "cascade" }),
    tokenId: (0, pg_core_1.text)("token_id").notNull().unique(),
    deviceFingerprint: (0, pg_core_1.jsonb)("device_fingerprint").notNull().default((0, drizzle_orm_1.sql) `'{}'::jsonb`),
    ipAddress: (0, pg_core_1.text)("ip_address").notNull(),
    country: (0, pg_core_1.text)("country"),
    userAgent: (0, pg_core_1.text)("user_agent"),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }).notNull(),
    lastActivityAt: (0, pg_core_1.timestamp)("last_activity_at", { withTimezone: true })
        .notNull()
        .default((0, drizzle_orm_1.sql) `now()`),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    revokedAt: (0, pg_core_1.timestamp)("revoked_at", { withTimezone: true }),
    revokedReason: (0, pg_core_1.text)("revoked_reason"),
    proofOfPossessionKey: (0, pg_core_1.text)("proof_of_possession_key"),
    continuousEvalResult: (0, pg_core_1.jsonb)("continuous_eval_result"),
    anomalyFlags: (0, pg_core_1.jsonb)("anomaly_flags"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    sessionsUserIdIsActiveIdx: (0, pg_core_1.index)("sessions_user_id_is_active_idx").on(t.userId, t.isActive),
    sessionsExpiresAtIsActiveIdx: (0, pg_core_1.index)("sessions_expires_at_is_active_idx").on(t.expiresAt, t.isActive),
}));
exports.rolesTable = (0, pg_core_1.pgTable)("roles", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    name: (0, pg_core_1.text)("name").notNull().unique(),
    displayName: (0, pg_core_1.text)("display_name").notNull(),
    description: (0, pg_core_1.text)("description"),
    permissions: (0, pg_core_1.jsonb)("permissions").notNull().default((0, drizzle_orm_1.sql) `'[]'::jsonb`),
    parentRoleId: (0, pg_core_1.uuid)("parent_role_id"),
    isSystem: (0, pg_core_1.boolean)("is_system").notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
});
exports.jitAccessTable = (0, pg_core_1.pgTable)("jit_access", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.usersTable.id, { onDelete: "cascade" }),
    roleId: (0, pg_core_1.uuid)("role_id").notNull(),
    reason: (0, pg_core_1.text)("reason").notNull(),
    requestedAt: (0, pg_core_1.timestamp)("requested_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }).notNull(),
    approvedBy: (0, pg_core_1.uuid)("approved_by"),
    approvedAt: (0, pg_core_1.timestamp)("approved_at", { withTimezone: true }),
    status: (0, pg_core_1.text)("status").notNull().default("pending"),
    revokedAt: (0, pg_core_1.timestamp)("revoked_at", { withTimezone: true }),
    revokedBy: (0, pg_core_1.uuid)("revoked_by"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
});
exports.refreshTokensTable = (0, pg_core_1.pgTable)("refresh_tokens", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.usersTable.id, { onDelete: "cascade" }),
    sessionId: (0, pg_core_1.uuid)("session_id")
        .notNull()
        .references(() => exports.sessionsTable.id, { onDelete: "cascade" }),
    tokenHash: (0, pg_core_1.text)("token_hash").notNull().unique(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }).notNull(),
    usedAt: (0, pg_core_1.timestamp)("used_at", { withTimezone: true }),
    isRevoked: (0, pg_core_1.boolean)("is_revoked").notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    refreshTokensUserRevokedExpiresIdx: (0, pg_core_1.index)("refresh_tokens_user_revoked_expires_idx").on(t.userId, t.isRevoked, t.expiresAt),
    refreshTokensSessionIdIdx: (0, pg_core_1.index)("refresh_tokens_session_id_idx").on(t.sessionId),
}));
exports.otpsTable = (0, pg_core_1.pgTable)("otps", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.text)("user_id").notNull(),
    code: (0, pg_core_1.text)("code").notNull(),
    type: (0, pg_core_1.text)("type").notNull(),
    channel: (0, pg_core_1.text)("channel").notNull(),
    target: (0, pg_core_1.text)("target").notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }).notNull(),
    usedAt: (0, pg_core_1.timestamp)("used_at", { withTimezone: true }),
    attempts: (0, pg_core_1.integer)("attempts").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    otpsUserIdTypeIdx: (0, pg_core_1.index)("otps_user_id_type_idx").on(t.userId, t.type),
}));
exports.oauthExchangeCodesTable = (0, pg_core_1.pgTable)("oauth_exchange_codes", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    code: (0, pg_core_1.text)("code").notNull().unique(),
    userId: (0, pg_core_1.uuid)("user_id").notNull(),
    sessionId: (0, pg_core_1.uuid)("session_id").notNull(),
    accessToken: (0, pg_core_1.text)("access_token").notNull(),
    refreshToken: (0, pg_core_1.text)("refresh_token").notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }).notNull(),
    usedAt: (0, pg_core_1.timestamp)("used_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
});
exports.userBehaviorBaselinesTable = (0, pg_core_1.pgTable)("user_behavior_baselines", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.usersTable.id, { onDelete: "cascade" })
        .unique(),
    loginHourStats: (0, pg_core_1.jsonb)("login_hour_stats")
        .notNull()
        .default((0, drizzle_orm_1.sql) `'{"mean":12,"variance":25,"count":0}'::jsonb`),
    sessionDurationStats: (0, pg_core_1.jsonb)("session_duration_stats")
        .notNull()
        .default((0, drizzle_orm_1.sql) `'{"mean":1800,"variance":360000,"count":0}'::jsonb`),
    knownIps: (0, pg_core_1.text)("known_ips").array().notNull().default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    knownCountries: (0, pg_core_1.text)("known_countries").array().notNull().default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    knownDevices: (0, pg_core_1.text)("known_devices").array().notNull().default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    totalLogins: (0, pg_core_1.integer)("total_logins").notNull().default(0),
    lastUpdatedAt: (0, pg_core_1.timestamp)("last_updated_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
});
exports.passkeysTable = (0, pg_core_1.pgTable)("passkeys", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.usersTable.id, { onDelete: "cascade" }),
    credentialId: (0, pg_core_1.text)("credential_id").notNull().unique(),
    publicKey: (0, pg_core_1.text)("public_key").notNull(),
    signCount: (0, pg_core_1.integer)("sign_count").notNull().default(0),
    deviceType: (0, pg_core_1.text)("device_type"),
    backedUp: (0, pg_core_1.boolean)("backed_up").notNull().default(false),
    transports: (0, pg_core_1.text)("transports").array().notNull().default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    aaguid: (0, pg_core_1.text)("aaguid"),
    deviceName: (0, pg_core_1.text)("device_name"),
    lastUsedAt: (0, pg_core_1.timestamp)("last_used_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    passkeysUserIdIdx: (0, pg_core_1.index)("passkeys_user_id_idx").on(t.userId),
    passkeysCredentialIdIdx: (0, pg_core_1.index)("passkeys_credential_id_idx").on(t.credentialId),
}));
exports.securityEventsTable = (0, pg_core_1.pgTable)("security_events", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.usersTable.id, { onDelete: "cascade" }),
    type: (0, pg_core_1.text)("type").notNull(), // "password_reset" | "email_change" | "mfa_disabled" | ...
    ipAddress: (0, pg_core_1.text)("ip_address"),
    userAgent: (0, pg_core_1.text)("user_agent"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
//# sourceMappingURL=identity.js.map