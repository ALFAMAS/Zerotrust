/** DI-1 — organizations domain tables. */
import { sql } from "drizzle-orm";
import {
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
import type { OrgBranding } from "./types";

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
    // Multi-tenant enterprise: custom domain and branding overrides.
    customDomain: text("custom_domain"),
    branding: jsonb("branding").$type<OrgBranding>(),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    organizationsCustomDomainIdx: index("organizations_custom_domain_idx").on(t.customDomain),
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

export const orgFeatureFlagsTable = pgTable(
  "org_feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    rolloutPercent: integer("rollout_percent").notNull().default(100),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqOrgKey: unique().on(t.orgId, t.key),
    orgFeatureFlagsOrgIdx: index("org_feature_flags_org_id_idx").on(t.orgId),
  })
);

/** Per-org SCIM bearer tokens (migration 0012). */
export const orgScimTokensTable = pgTable(
  "org_scim_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  },
  (t) => ({
    orgScimTokensOrgIdx: index("org_scim_tokens_org_id_idx").on(t.orgId),
  })
);

export const crossTenantJITRequestsTable = pgTable(
  "cross_tenant_jit_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    requestorUserId: uuid("requestor_user_id").notNull(),
    requestorOrgId: uuid("requestor_org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    targetOrgId: uuid("target_org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    targetResource: text("target_resource").notNull(),
    justification: text("justification").notNull(),
    ttlSeconds: integer("ttl_seconds").notNull(),
    // pending | approved | denied | expired
    status: text("status").notNull().default("pending"),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    crossTenantJitRequestorOrgIdx: index("cross_tenant_jit_requestor_org_idx").on(t.requestorOrgId),
    crossTenantJitTargetOrgIdx: index("cross_tenant_jit_target_org_idx").on(t.targetOrgId),
  })
);
