"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crossTenantJITRequestsTable = exports.trustedDevicesTable = exports.orgCustomRolesTable = exports.organizationInvitesTable = exports.organizationMembersTable = exports.orgSecurityPoliciesTable = exports.organizationsTable = void 0;
/** DI-1 — organizations domain tables. */
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const identity_1 = require("./identity");
exports.organizationsTable = (0, pg_core_1.pgTable)("organizations", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)("name").notNull(),
    slug: (0, pg_core_1.text)("slug").notNull().unique(),
    logoUrl: (0, pg_core_1.text)("logo_url"),
    billingEmail: (0, pg_core_1.text)("billing_email"),
    ownerId: (0, pg_core_1.uuid)("owner_id").references(() => identity_1.usersTable.id, {
        onDelete: "cascade",
    }),
    // Multi-tenant enterprise: custom domain and branding overrides.
    customDomain: (0, pg_core_1.text)("custom_domain"),
    branding: (0, pg_core_1.jsonb)("branding").$type(),
    version: (0, pg_core_1.integer)("version").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
}, (t) => ({
    organizationsCustomDomainIdx: (0, pg_core_1.index)("organizations_custom_domain_idx").on(t.customDomain),
}));
exports.orgSecurityPoliciesTable = (0, pg_core_1.pgTable)("org_security_policies", {
    orgId: (0, pg_core_1.uuid)("org_id")
        .primaryKey()
        .references(() => exports.organizationsTable.id, { onDelete: "cascade" }),
    requirePasskeyAttestation: (0, pg_core_1.boolean)("require_passkey_attestation").notNull().default(false),
    requireHardwarePasskey: (0, pg_core_1.boolean)("require_hardware_passkey").notNull().default(false),
    allowedPasskeyAaguids: (0, pg_core_1.text)("allowed_passkey_aaguids")
        .array()
        .notNull()
        .default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    deniedPasskeyAaguids: (0, pg_core_1.text)("denied_passkey_aaguids")
        .array()
        .notNull()
        .default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    // IPv4 CIDR allowlist. Empty = no restriction; non-empty restricts org-scoped
    // API access to callers whose IP matches one of the ranges.
    ipAllowlist: (0, pg_core_1.text)("ip_allowlist").array().notNull().default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    // ── Session & device policy (enforced in the auth middleware) ──
    // All numeric limits use 0 = unlimited.
    maxSessionAgeSeconds: (0, pg_core_1.integer)("max_session_age_seconds").notNull().default(0),
    idleTimeoutSeconds: (0, pg_core_1.integer)("idle_timeout_seconds").notNull().default(0),
    maxConcurrentSessions: (0, pg_core_1.integer)("max_concurrent_sessions").notNull().default(0),
    // ISO 3166-1 alpha-2 codes a member's session may originate from. Empty = any.
    allowedCountries: (0, pg_core_1.text)("allowed_countries").array().notNull().default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    // When true, org members must use a registered trusted device to access the org.
    requireTrustedDevices: (0, pg_core_1.boolean)("require_trusted_devices").notNull().default(false),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
    updatedBy: (0, pg_core_1.uuid)("updated_by").references(() => identity_1.usersTable.id, {
        onDelete: "set null",
    }),
});
exports.organizationMembersTable = (0, pg_core_1.pgTable)("organization_members", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    orgId: (0, pg_core_1.uuid)("org_id")
        .notNull()
        .references(() => exports.organizationsTable.id, { onDelete: "cascade" }),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => identity_1.usersTable.id, { onDelete: "cascade" }),
    role: (0, pg_core_1.text)("role").notNull().default("member"), // owner | admin | member | viewer | custom
    customRoleId: (0, pg_core_1.uuid)("custom_role_id"), // populated when role = "custom"
    invitedBy: (0, pg_core_1.uuid)("invited_by").references(() => identity_1.usersTable.id, {
        onDelete: "set null",
    }),
    joinedAt: (0, pg_core_1.timestamp)("joined_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
}, (t) => ({
    uniq: (0, pg_core_1.unique)().on(t.orgId, t.userId),
    organizationMembersUserIdIdx: (0, pg_core_1.index)("organization_members_user_id_idx").on(t.userId),
    organizationMembersOrgIdRoleIdx: (0, pg_core_1.index)("organization_members_org_id_role_idx").on(t.orgId, t.role),
}));
exports.organizationInvitesTable = (0, pg_core_1.pgTable)("organization_invites", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    orgId: (0, pg_core_1.uuid)("org_id")
        .notNull()
        .references(() => exports.organizationsTable.id, { onDelete: "cascade" }),
    email: (0, pg_core_1.text)("email").notNull(),
    role: (0, pg_core_1.text)("role").notNull().default("member"),
    token: (0, pg_core_1.text)("token").notNull().unique(),
    invitedBy: (0, pg_core_1.uuid)("invited_by").references(() => identity_1.usersTable.id, {
        onDelete: "set null",
    }),
    expiresAt: (0, pg_core_1.timestamp)("expires_at").notNull(),
    usedAt: (0, pg_core_1.timestamp)("used_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
exports.orgCustomRolesTable = (0, pg_core_1.pgTable)("org_custom_roles", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    orgId: (0, pg_core_1.uuid)("org_id")
        .notNull()
        .references(() => exports.organizationsTable.id, { onDelete: "cascade" }),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    permissions: (0, pg_core_1.text)("permissions").array().notNull().default((0, drizzle_orm_1.sql) `ARRAY[]::text[]`),
    isDefault: (0, pg_core_1.boolean)("is_default").notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
}, (t) => ({ uniqNamePerOrg: (0, pg_core_1.unique)().on(t.orgId, t.name) }));
exports.trustedDevicesTable = (0, pg_core_1.pgTable)("trusted_devices", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    orgId: (0, pg_core_1.uuid)("org_id")
        .notNull()
        .references(() => exports.organizationsTable.id, { onDelete: "cascade" }),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => identity_1.usersTable.id, { onDelete: "cascade" }),
    deviceName: (0, pg_core_1.text)("device_name").notNull(),
    deviceFingerprint: (0, pg_core_1.text)("device_fingerprint").notNull(),
    registeredBy: (0, pg_core_1.uuid)("registered_by").references(() => identity_1.usersTable.id, {
        onDelete: "set null",
    }),
    lastUsedAt: (0, pg_core_1.timestamp)("last_used_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    trustedDevicesOrgIdIdx: (0, pg_core_1.index)("trusted_devices_org_id_idx").on(t.orgId),
    trustedDevicesFingerprintUnq: (0, pg_core_1.unique)().on(t.orgId, t.deviceFingerprint),
}));
exports.crossTenantJITRequestsTable = (0, pg_core_1.pgTable)("cross_tenant_jit_requests", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    requestorUserId: (0, pg_core_1.uuid)("requestor_user_id").notNull(),
    requestorOrgId: (0, pg_core_1.uuid)("requestor_org_id")
        .notNull()
        .references(() => exports.organizationsTable.id, { onDelete: "cascade" }),
    targetOrgId: (0, pg_core_1.uuid)("target_org_id")
        .notNull()
        .references(() => exports.organizationsTable.id, { onDelete: "cascade" }),
    targetResource: (0, pg_core_1.text)("target_resource").notNull(),
    justification: (0, pg_core_1.text)("justification").notNull(),
    ttlSeconds: (0, pg_core_1.integer)("ttl_seconds").notNull(),
    // pending | approved | denied | expired
    status: (0, pg_core_1.text)("status").notNull().default("pending"),
    approvedBy: (0, pg_core_1.uuid)("approved_by"),
    approvedAt: (0, pg_core_1.timestamp)("approved_at", { withTimezone: true }),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    crossTenantJitRequestorOrgIdx: (0, pg_core_1.index)("cross_tenant_jit_requestor_org_idx").on(t.requestorOrgId),
    crossTenantJitTargetOrgIdx: (0, pg_core_1.index)("cross_tenant_jit_target_org_idx").on(t.targetOrgId),
}));
//# sourceMappingURL=organizations.js.map