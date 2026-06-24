import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../../db";
import {
  organizationInvitesTable,
  organizationMembersTable,
  organizationsTable,
  orgCustomRolesTable,
  orgSecurityPoliciesTable,
  usersTable,
} from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import {
  createOrgScimToken,
  listOrgScimTokens,
  revokeOrgScimToken,
  rotateOrgScimToken,
} from "../../services/orgScimToken.service";
import { getOrgSecurityPolicy } from "../../services/orgSecurityPolicy.service";
import { clearSessionPolicyCache } from "../../services/sessionPolicy.service";
import { ipMatchesAny, isValidCidrOrIp } from "../../shared/cidr";
import { getClientIp } from "../../shared/clientIp";
import { ORG_PERMISSIONS } from "../../shared/permissions";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("org-routes");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Apply auth to all routes ──────────────────────────────────────────────────
router.use("*", authMiddleware);

// ── Per-org IP allowlist ────────────────────────────────────────────────────────
// When an org configures an IP allowlist, every org-scoped request must come
// from an allowed range. Runs on `/:orgId` routes only; the UUID guard prevents
// literal paths like `/invites/accept` from being treated as an org id (which
// would otherwise hit the uuid column with bad input).
async function enforceOrgIpAllowlist(c: any, next: any) {
  const orgId = c.req.param("orgId");
  if (orgId && UUID_RE.test(orgId)) {
    const policy = await getOrgSecurityPolicy(orgId);
    if (policy.ipAllowlist && policy.ipAllowlist.length > 0) {
      const ip = getClientIp(c);
      if (!ipMatchesAny(ip, policy.ipAllowlist)) {
        logger.warn("Org IP allowlist denied access", { orgId, ip });
        return c.json(
          {
            error: "ACCESS_DENIED_IP",
            message: "Access from this IP is not allowed for this organization",
          },
          403
        );
      }
    }
  }
  return next();
}
router.use("/:orgId", enforceOrgIpAllowlist);
router.use("/:orgId/*", enforceOrgIpAllowlist);

// ── Per-org trusted-device enforcement ────────────────────────────────────────
// When an org requires trusted devices, every org-scoped request must come from
// a registered device fingerprint. Runs on `/:orgId` routes only.

async function enforceOrgTrustedDevice(c: any, next: any) {
  const orgId = c.req.param("orgId");
  if (orgId && UUID_RE.test(orgId)) {
    try {
      const policy = await getOrgSecurityPolicy(orgId);
      if (policy.requireTrustedDevices) {
        const userId = c.get("user")?.id;
        if (!userId) return c.json({ error: "UNAUTHORIZED" }, 401);

        // Get device fingerprint from request headers
        const deviceFingerprint = c.req.header("x-device-fingerprint");
        if (!deviceFingerprint) {
          return c.json(
            {
              error: "TRUSTED_DEVICE_REQUIRED",
              message:
                "This organization requires access from a registered trusted device. Register this device in your org settings.",
            },
            403
          );
        }

        const { isDeviceTrusted } = await import("../../services/trustedDevice.service.js");
        const trusted = await isDeviceTrusted(orgId, deviceFingerprint);
        if (!trusted) {
          return c.json(
            {
              error: "TRUSTED_DEVICE_REQUIRED",
              message:
                "This device is not registered as trusted for this organization. Register it in your org settings.",
            },
            403
          );
        }

        // Update last used timestamp (fire-and-forget)
        const { updateLastUsed } = await import("../../services/trustedDevice.service.js");
        void updateLastUsed(orgId, deviceFingerprint);
      }
    } catch (err) {
      logger.error("Trusted device enforcement error", { orgId, error: String(err) });
    }
  }
  return next();
}
router.use("/:orgId", enforceOrgTrustedDevice);
router.use("/:orgId/*", enforceOrgTrustedDevice);

// ── Types ─────────────────────────────────────────────────────────────────────

type DrizzleDB = ReturnType<typeof getDb>;

type OrgRole = "viewer" | "member" | "admin" | "owner";

interface OrganizationMember {
  id: string;
  orgId: string;
  userId: string;
  role: string;
  invitedBy: string | null;
  joinedAt: Date | null;
  createdAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_ORDER: OrgRole[] = ["viewer", "member", "admin", "owner"];

function roleRank(role: string): number {
  const idx = ROLE_ORDER.indexOf(role as OrgRole);
  return idx === -1 ? -1 : idx;
}

async function requireOrgRole(
  orgId: string,
  userId: string,
  db: DrizzleDB,
  minRole: OrgRole
): Promise<OrganizationMember> {
  const rows = await db
    .select()
    .from(organizationMembersTable)
    .where(
      and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
    )
    .limit(1);

  if (rows.length === 0) {
    throw new HTTPException(403, { message: "Not a member of this organization" });
  }

  const member = rows[0] as OrganizationMember;
  if (roleRank(member.role) < roleRank(minRole)) {
    throw new HTTPException(403, { message: "Insufficient role" });
  }

  return member;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const CreateOrgSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
});

const UpdateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  logoUrl: z.string().optional(),
  billingEmail: z.string().email().optional(),
});

const UpdateMemberRoleSchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

const CreateInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member", "viewer"]).default("member"),
});

const AcceptInviteSchema = z.object({
  token: z.string().min(1),
});

const TransferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid(),
});

const UpdateSecurityPolicySchema = z.object({
  requirePasskeyAttestation: z.boolean().optional(),
  requireHardwarePasskey: z.boolean().optional(),
  allowedPasskeyAaguids: z.array(z.string().uuid()).max(100).optional(),
  deniedPasskeyAaguids: z.array(z.string().uuid()).max(100).optional(),
  ipAllowlist: z
    .array(z.string().refine(isValidCidrOrIp, "Must be an IPv4 address or CIDR"))
    .max(100)
    .optional(),
  // Session & device policy — 0 = unlimited.
  maxSessionAgeSeconds: z.number().int().min(0).max(31_536_000).optional(),
  idleTimeoutSeconds: z.number().int().min(0).max(31_536_000).optional(),
  maxConcurrentSessions: z.number().int().min(0).max(1000).optional(),
  allowedCountries: z
    .array(z.string().regex(/^[A-Z]{2}$/, "Must be an ISO 3166-1 alpha-2 code"))
    .max(250)
    .optional(),
  requireTrustedDevices: z.boolean().optional(),
});

// ── POST / ────────────────────────────────────────────────────────────────────
// Create organization
router.post("/", async (c) => {
  try {
    const user = c.get("user");
    const body = (await c.req.json()) as Record<string, unknown>;
    const parsed = CreateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
    }

    const { name } = parsed.data;
    const slug = parsed.data.slug ?? slugify(name);

    // Validate slug format
    if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
      return c.json(
        {
          error: "INVALID_REQUEST",
          message: "Slug must be 3-50 lowercase letters, digits, or hyphens",
        },
        400
      );
    }

    const db = getDb();

    // Check slug uniqueness
    const existing = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      return c.json({ error: "SLUG_CONFLICT", message: "Slug already in use" }, 409);
    }

    // Insert org
    const orgRows = await db
      .insert(organizationsTable)
      .values({ name, slug, ownerId: user.id })
      .returning();
    const org = orgRows[0];

    // Insert owner member
    const memberRows = await db
      .insert(organizationMembersTable)
      .values({
        orgId: org.id,
        userId: user.id,
        role: "owner",
        joinedAt: new Date(),
      })
      .returning();
    const member = memberRows[0];

    return c.json({ org, member }, 201);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Create org error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to create organization" }, 500);
  }
});

// ── GET / ─────────────────────────────────────────────────────────────────────
// List orgs for current user
router.get("/", async (c) => {
  try {
    const user = c.get("user");
    const db = getDb();

    const rows = await db
      .select({
        org: organizationsTable,
        member: organizationMembersTable,
      })
      .from(organizationMembersTable)
      .innerJoin(organizationsTable, eq(organizationMembersTable.orgId, organizationsTable.id))
      .where(eq(organizationMembersTable.userId, user.id));

    return c.json({ orgs: rows });
  } catch (err) {
    logger.error("List orgs error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to list organizations" }, 500);
  }
});

// ── GET /:orgId/security/policy ───────────────────────────────────────────────
// Read org-level passkey attestation policy (viewer+)
router.get("/:orgId/security/policy", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();

    await requireOrgRole(orgId, user.id, db, "viewer");

    const [policy] = await db
      .select()
      .from(orgSecurityPoliciesTable)
      .where(eq(orgSecurityPoliciesTable.orgId, orgId))
      .limit(1);

    return c.json({
      policy: policy ?? {
        orgId,
        requirePasskeyAttestation: false,
        requireHardwarePasskey: false,
        allowedPasskeyAaguids: [],
        deniedPasskeyAaguids: [],
        ipAllowlist: [],
        maxSessionAgeSeconds: 0,
        idleTimeoutSeconds: 0,
        maxConcurrentSessions: 0,
        allowedCountries: [],
      },
    });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Get org security policy error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to get security policy" }, 500);
  }
});

// ── PUT /:orgId/security/policy ───────────────────────────────────────────────
// Update org-level passkey attestation policy (admin+)
router.put("/:orgId/security/policy", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();

    await requireOrgRole(orgId, user.id, db, "admin");

    const body = (await c.req.json()) as Record<string, unknown>;
    const parsed = UpdateSecurityPolicySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    }

    const values = {
      orgId,
      requirePasskeyAttestation: parsed.data.requirePasskeyAttestation ?? false,
      requireHardwarePasskey: parsed.data.requireHardwarePasskey ?? false,
      allowedPasskeyAaguids: parsed.data.allowedPasskeyAaguids ?? [],
      deniedPasskeyAaguids: parsed.data.deniedPasskeyAaguids ?? [],
      ipAllowlist: parsed.data.ipAllowlist ?? [],
      maxSessionAgeSeconds: parsed.data.maxSessionAgeSeconds ?? 0,
      idleTimeoutSeconds: parsed.data.idleTimeoutSeconds ?? 0,
      maxConcurrentSessions: parsed.data.maxConcurrentSessions ?? 0,
      allowedCountries: parsed.data.allowedCountries ?? [],
      requireTrustedDevices: parsed.data.requireTrustedDevices ?? false,
      updatedAt: new Date(),
      updatedBy: user.id,
    };

    const [policy] = await db
      .insert(orgSecurityPoliciesTable)
      .values(values)
      .onConflictDoUpdate({
        target: orgSecurityPoliciesTable.orgId,
        set: {
          requirePasskeyAttestation: values.requirePasskeyAttestation,
          requireHardwarePasskey: values.requireHardwarePasskey,
          allowedPasskeyAaguids: values.allowedPasskeyAaguids,
          deniedPasskeyAaguids: values.deniedPasskeyAaguids,
          ipAllowlist: values.ipAllowlist,
          maxSessionAgeSeconds: values.maxSessionAgeSeconds,
          idleTimeoutSeconds: values.idleTimeoutSeconds,
          maxConcurrentSessions: values.maxConcurrentSessions,
          allowedCountries: values.allowedCountries,
          updatedAt: values.updatedAt,
          updatedBy: values.updatedBy,
        },
      })
      .returning();

    // Effective policy is cached per-user in the auth middleware; drop it so
    // the new limits take effect promptly.
    clearSessionPolicyCache();

    return c.json({ policy });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Update org security policy error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to update security policy" }, 500);
  }
});

// ── Org SSO config ────────────────────────────────────────────────────────────
// Self-serve SAML/OIDC configuration per organization. Org admins can upload
// metadata, set fields manually, and test the connection without redeploying.

import type { OrgSsoConfig } from "../../db/schema";

const UpdateSsoConfigSchema = z.object({
  saml: z
    .object({
      enabled: z.boolean().default(false),
      idpEntityId: z.string().max(2048).optional(),
      idpSsoUrl: z.string().url().max(2048).optional(),
      idpCert: z.string().max(50000).optional(),
    })
    .optional(),
  oidc: z
    .object({
      enabled: z.boolean().default(false),
      issuerUrl: z.string().url().max(2048).optional(),
      clientId: z.string().max(2048).optional(),
      clientSecret: z.string().max(2048).optional(),
      redirectUris: z.array(z.string().url().max(2048)).max(20).optional(),
    })
    .optional(),
});

// GET /:orgId/sso — read current SSO config (admin+)
router.get("/:orgId/sso", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();
    await requireOrgRole(orgId, user.id, db, "admin");

    const [org] = await db
      .select({ ssoConfig: organizationsTable.ssoConfig })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);

    return c.json({ sso: org?.ssoConfig ?? null });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Get org SSO config error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// PUT /:orgId/sso — update SSO config (admin+)
router.put("/:orgId/sso", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();
    await requireOrgRole(orgId, user.id, db, "admin");

    const body = (await c.req.json()) as Record<string, unknown>;
    const parsed = UpdateSsoConfigSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    }

    // Merge with existing config
    const [existing] = await db
      .select({ ssoConfig: organizationsTable.ssoConfig })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);

    const current: OrgSsoConfig = (existing?.ssoConfig as OrgSsoConfig) ?? {};
    const updated: OrgSsoConfig = {
      ...current,
      ...(parsed.data.saml ? { saml: { ...current.saml, ...parsed.data.saml } } : {}),
      ...(parsed.data.oidc ? { oidc: { ...current.oidc, ...parsed.data.oidc } } : {}),
    };

    const [org] = await db
      .update(organizationsTable)
      .set({ ssoConfig: updated, updatedAt: new Date() })
      .where(eq(organizationsTable.id, orgId))
      .returning({ ssoConfig: organizationsTable.ssoConfig });

    return c.json({ sso: org?.ssoConfig ?? null });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Update org SSO config error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /:orgId/sso/test — test SSO connection (admin+)
// Performs a lightweight connectivity check (HTTP GET to IdP metadata/OIDC discovery).
router.post("/:orgId/sso/test", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();
    await requireOrgRole(orgId, user.id, db, "admin");

    const [org] = await db
      .select({ ssoConfig: organizationsTable.ssoConfig })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);

    const sso: OrgSsoConfig = (org?.ssoConfig as OrgSsoConfig) ?? {};
    const results: {
      saml?: { status: string; error?: string };
      oidc?: { status: string; error?: string };
    } = {};

    if (sso.saml?.enabled && sso.saml.idpSsoUrl) {
      try {
        const res = await fetch(sso.saml.idpSsoUrl, {
          method: "GET",
          signal: AbortSignal.timeout(10_000),
        });
        results.saml = {
          status: res.ok ? "success" : "error",
          error: res.ok ? undefined : `HTTP ${res.status}`,
        };
      } catch (e) {
        results.saml = { status: "error", error: (e as Error).message };
      }
    }

    if (sso.oidc?.enabled && sso.oidc.issuerUrl) {
      try {
        const wellKnown = new URL("/.well-known/openid-configuration", sso.oidc.issuerUrl);
        const res = await fetch(wellKnown.toString(), { signal: AbortSignal.timeout(10_000) });
        results.oidc = {
          status: res.ok ? "success" : "error",
          error: res.ok ? undefined : `HTTP ${res.status}`,
        };
      } catch (e) {
        results.oidc = { status: "error", error: (e as Error).message };
      }
    }

    // Persist test results
    const updated: OrgSsoConfig = { ...sso };
    if (results.saml) {
      updated.saml = {
        ...updated.saml!,
        lastTestedAt: new Date().toISOString(),
        lastTestStatus: results.saml.status as "success" | "error",
        lastTestError: results.saml.error,
      };
    }
    if (results.oidc) {
      updated.oidc = {
        ...updated.oidc!,
        lastTestedAt: new Date().toISOString(),
        lastTestStatus: results.oidc.status as "success" | "error",
        lastTestError: results.oidc.error,
      };
    }
    await db
      .update(organizationsTable)
      .set({ ssoConfig: updated, updatedAt: new Date() })
      .where(eq(organizationsTable.id, orgId));

    return c.json({ results });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Test org SSO config error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Trusted devices ───────────────────────────────────────────────────────────

const RegisterTrustedDeviceSchema = z.object({
  userId: z.string().uuid(),
  deviceName: z.string().trim().min(1).max(100),
  deviceFingerprint: z.string().trim().min(1).max(512),
});

// GET /:orgId/trusted-devices — list trusted devices (admin+)
router.get("/:orgId/trusted-devices", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();
    await requireOrgRole(orgId, user.id, db, "admin");
    const { listTrustedDevices } = await import("../../services/trustedDevice.service.js");
    const devices = await listTrustedDevices(orgId);
    return c.json({ devices });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("List trusted devices error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /:orgId/trusted-devices — register a trusted device (admin+)
router.post("/:orgId/trusted-devices", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();
    await requireOrgRole(orgId, user.id, db, "admin");
    const body = (await c.req.json()) as Record<string, unknown>;
    const parsed = RegisterTrustedDeviceSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const { registerTrustedDevice } = await import("../../services/trustedDevice.service.js");
    const device = await registerTrustedDevice({
      orgId,
      userId: parsed.data.userId,
      deviceName: parsed.data.deviceName,
      deviceFingerprint: parsed.data.deviceFingerprint,
      registeredBy: user.id,
    });
    return c.json({ device }, 201);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Register trusted device error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// DELETE /:orgId/trusted-devices/:deviceId — remove a trusted device (admin+)
router.delete("/:orgId/trusted-devices/:deviceId", async (c) => {
  try {
    const user = c.get("user");
    const { orgId, deviceId } = c.req.param();
    const db = getDb();
    await requireOrgRole(orgId, user.id, db, "admin");
    const { removeTrustedDevice } = await import("../../services/trustedDevice.service.js");
    const removed = await removeTrustedDevice(orgId, deviceId);
    if (!removed) return c.json({ error: "NOT_FOUND", message: "Device not found" }, 404);
    return c.body(null, 204);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Remove trusted device error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Org SCIM tokens ──────────────────────────────────────────────────────────
//
// Per-org SCIM 2.0 (RFC 7644) bearer tokens. Admins generate one in the
// dashboard and paste it into their IdP (Okta, Azure AD, Google Workspace)
// so the IdP can call /scim/v2/* against this org. Plaintext is returned
// exactly once at creation/rotation; only the hash is persisted.

const CreateScimTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  // Optional ISO-8601 expiry. null/omitted = no automatic expiry.
  expiresAt: z.string().datetime().nullable().optional(),
});

// ── GET /:orgId/scim/tokens ─ List SCIM tokens (admin+)
router.get("/:orgId/scim/tokens", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();
    await requireOrgRole(orgId, user.id, db, "admin");

    const tokens = await listOrgScimTokens(orgId);
    return c.json({ tokens });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("List org SCIM tokens error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to list SCIM tokens" }, 500);
  }
});

// ── POST /:orgId/scim/tokens ─ Issue a new SCIM token (admin+)
// Returns the plaintext exactly once. The caller must surface it to the admin
// immediately; subsequent GETs only return metadata.
router.post("/:orgId/scim/tokens", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();
    await requireOrgRole(orgId, user.id, db, "admin");

    const body = (await c.req.json()) as Record<string, unknown>;
    const parsed = CreateScimTokenSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    }

    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
    const result = await createOrgScimToken({
      orgId,
      name: parsed.data.name,
      createdBy: user.id,
      expiresAt,
    });

    return c.json({ token: result.token, plaintext: result.plaintext }, 201);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Create org SCIM token error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to create SCIM token" }, 500);
  }
});

// ── POST /:orgId/scim/tokens/:tokenId/rotate ─ Rotate (admin+)
// Revokes the old token and issues a new one with the same name. The new
// plaintext is returned exactly once; the old token stops working immediately.
router.post("/:orgId/scim/tokens/:tokenId/rotate", async (c) => {
  try {
    const user = c.get("user");
    const { orgId, tokenId } = c.req.param();
    const db = getDb();
    await requireOrgRole(orgId, user.id, db, "admin");

    const result = await rotateOrgScimToken({ orgId, tokenId, rotatedBy: user.id });
    if (!result) {
      return c.json({ error: "NOT_FOUND", message: "Token not found or already revoked" }, 404);
    }

    return c.json({ token: result.token, plaintext: result.plaintext });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Rotate org SCIM token error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to rotate SCIM token" }, 500);
  }
});

// ── DELETE /:orgId/scim/tokens/:tokenId ─ Revoke (admin+)
// Idempotent — revoking an already-revoked token returns 404 (already gone).
router.delete("/:orgId/scim/tokens/:tokenId", async (c) => {
  try {
    const user = c.get("user");
    const { orgId, tokenId } = c.req.param();
    const db = getDb();
    await requireOrgRole(orgId, user.id, db, "admin");

    const revoked = await revokeOrgScimToken(orgId, tokenId);
    if (!revoked) {
      return c.json({ error: "NOT_FOUND", message: "Token not found or already revoked" }, 404);
    }

    return c.body(null, 204);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Revoke org SCIM token error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to revoke SCIM token" }, 500);
  }
});

// ── GET /:orgId ───────────────────────────────────────────────────────────────
// Get org details with member count
router.get("/:orgId", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();

    await requireOrgRole(orgId, user.id, db, "viewer");

    const orgs = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);

    if (orgs.length === 0) {
      return c.json({ error: "NOT_FOUND", message: "Organization not found" }, 404);
    }

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationMembersTable)
      .where(eq(organizationMembersTable.orgId, orgId));

    const memberCount = countResult[0]?.count ?? 0;

    return c.json({ org: orgs[0], memberCount });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Get org error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to get organization" }, 500);
  }
});

// ── PUT /:orgId ───────────────────────────────────────────────────────────────
// Update org (admin+)
router.put("/:orgId", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();

    await requireOrgRole(orgId, user.id, db, "admin");

    const body = (await c.req.json()) as Record<string, unknown>;
    const parsed = UpdateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
    }

    const updates: Partial<{
      name: string;
      logoUrl: string | null;
      billingEmail: string | null;
      updatedAt: Date;
    }> = {
      updatedAt: new Date(),
    };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.logoUrl !== undefined) updates.logoUrl = parsed.data.logoUrl;
    if (parsed.data.billingEmail !== undefined) updates.billingEmail = parsed.data.billingEmail;

    const orgRows = await db
      .update(organizationsTable)
      .set(updates)
      .where(eq(organizationsTable.id, orgId))
      .returning();

    if (orgRows.length === 0) {
      return c.json({ error: "NOT_FOUND", message: "Organization not found" }, 404);
    }

    return c.json({ org: orgRows[0] });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Update org error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to update organization" }, 500);
  }
});

// ── DELETE /:orgId ────────────────────────────────────────────────────────────
// Delete org (owner only)
router.delete("/:orgId", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();

    await requireOrgRole(orgId, user.id, db, "owner");

    await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));

    return c.json({ success: true });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Delete org error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to delete organization" }, 500);
  }
});

// ── GET /:orgId/members ───────────────────────────────────────────────────────
// List members with user info (viewer+)
router.get("/:orgId/members", async (c) => {
  try {
    const user = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();

    await requireOrgRole(orgId, user.id, db, "viewer");

    const rows = await db
      .select({
        member: organizationMembersTable,
        user: {
          id: usersTable.id,
          email: usersTable.email,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
        },
      })
      .from(organizationMembersTable)
      .innerJoin(usersTable, eq(organizationMembersTable.userId, usersTable.id))
      .where(eq(organizationMembersTable.orgId, orgId));

    return c.json({ members: rows });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("List members error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to list members" }, 500);
  }
});

// ── DELETE /:orgId/members/:userId ────────────────────────────────────────────
// Remove a member (admin+); cannot remove the owner
router.delete("/:orgId/members/:userId", async (c) => {
  try {
    const currentUser = c.get("user");
    const { orgId, userId } = c.req.param();
    const db = getDb();

    await requireOrgRole(orgId, currentUser.id, db, "admin");

    // Check target member exists and is not the owner
    const targetRows = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
      )
      .limit(1);

    if (targetRows.length === 0) {
      return c.json({ error: "NOT_FOUND", message: "Member not found" }, 404);
    }

    const target = targetRows[0] as OrganizationMember;
    if (target.role === "owner") {
      return c.json({ error: "FORBIDDEN", message: "Cannot remove the org owner" }, 403);
    }

    await db
      .delete(organizationMembersTable)
      .where(
        and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
      );

    return c.json({ success: true });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Remove member error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to remove member" }, 500);
  }
});

// ── PUT /:orgId/members/:userId ───────────────────────────────────────────────
// Change member role (owner only); cannot change own role
router.put("/:orgId/members/:userId", async (c) => {
  try {
    const currentUser = c.get("user");
    const { orgId, userId } = c.req.param();
    const db = getDb();

    await requireOrgRole(orgId, currentUser.id, db, "owner");

    if (userId === currentUser.id) {
      return c.json({ error: "FORBIDDEN", message: "Cannot change your own role" }, 403);
    }

    const body = (await c.req.json()) as Record<string, unknown>;
    const parsed = UpdateMemberRoleSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
    }

    const targetRows = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
      )
      .limit(1);

    if (targetRows.length === 0) {
      return c.json({ error: "NOT_FOUND", message: "Member not found" }, 404);
    }

    const memberRows = await db
      .update(organizationMembersTable)
      .set({ role: parsed.data.role })
      .where(
        and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
      )
      .returning();

    return c.json({ member: memberRows[0] });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Update member role error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to update member role" }, 500);
  }
});

// ── POST /:orgId/transfer ─────────────────────────────────────────────────────
// Transfer ownership (current owner only)
router.post("/:orgId/transfer", async (c) => {
  try {
    const currentUser = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();

    await requireOrgRole(orgId, currentUser.id, db, "owner");

    const body = (await c.req.json()) as Record<string, unknown>;
    const parsed = TransferOwnershipSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
    }

    const { newOwnerId } = parsed.data;

    if (newOwnerId === currentUser.id) {
      return c.json(
        { error: "INVALID_REQUEST", message: "Cannot transfer ownership to yourself" },
        400
      );
    }

    // Check new owner is a member
    const newOwnerRows = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(
          eq(organizationMembersTable.orgId, orgId),
          eq(organizationMembersTable.userId, newOwnerId)
        )
      )
      .limit(1);

    if (newOwnerRows.length === 0) {
      return c.json(
        { error: "NOT_FOUND", message: "New owner is not a member of this organization" },
        404
      );
    }

    // Set new owner role=owner
    await db
      .update(organizationMembersTable)
      .set({ role: "owner" })
      .where(
        and(
          eq(organizationMembersTable.orgId, orgId),
          eq(organizationMembersTable.userId, newOwnerId)
        )
      );

    // Demote current owner to admin
    await db
      .update(organizationMembersTable)
      .set({ role: "admin" })
      .where(
        and(
          eq(organizationMembersTable.orgId, orgId),
          eq(organizationMembersTable.userId, currentUser.id)
        )
      );

    // Update ownerId on org record
    await db
      .update(organizationsTable)
      .set({ ownerId: newOwnerId, updatedAt: new Date() })
      .where(eq(organizationsTable.id, orgId));

    return c.json({ success: true, newOwnerId });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Transfer ownership error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to transfer ownership" }, 500);
  }
});

// ── POST /:orgId/invites ──────────────────────────────────────────────────────
// Create invite (admin+)
router.post("/:orgId/invites", async (c) => {
  try {
    const currentUser = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();

    await requireOrgRole(orgId, currentUser.id, db, "admin");

    const body = (await c.req.json()) as Record<string, unknown>;
    const parsed = CreateInviteSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
    }

    const { email, role } = parsed.data;
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const inviteRows = await db
      .insert(organizationInvitesTable)
      .values({
        orgId,
        email: email.toLowerCase(),
        role,
        token,
        invitedBy: currentUser.id,
        expiresAt,
      })
      .returning();

    return c.json({ invite: inviteRows[0] }, 201);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Create invite error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to create invite" }, 500);
  }
});

// ── GET /:orgId/invites ───────────────────────────────────────────────────────
// List pending invites (admin+)
router.get("/:orgId/invites", async (c) => {
  try {
    const currentUser = c.get("user");
    const { orgId } = c.req.param();
    const db = getDb();

    await requireOrgRole(orgId, currentUser.id, db, "admin");

    const now = new Date();
    const invites = await db
      .select()
      .from(organizationInvitesTable)
      .where(
        and(
          eq(organizationInvitesTable.orgId, orgId),
          isNull(organizationInvitesTable.usedAt),
          gt(organizationInvitesTable.expiresAt, now)
        )
      );

    return c.json({ invites });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("List invites error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to list invites" }, 500);
  }
});

// ── DELETE /:orgId/invites/:inviteId ──────────────────────────────────────────
// Revoke invite (admin+)
router.delete("/:orgId/invites/:inviteId", async (c) => {
  try {
    const currentUser = c.get("user");
    const { orgId, inviteId } = c.req.param();
    const db = getDb();

    await requireOrgRole(orgId, currentUser.id, db, "admin");

    const rows = await db
      .select()
      .from(organizationInvitesTable)
      .where(
        and(eq(organizationInvitesTable.id, inviteId), eq(organizationInvitesTable.orgId, orgId))
      )
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: "NOT_FOUND", message: "Invite not found" }, 404);
    }

    await db.delete(organizationInvitesTable).where(eq(organizationInvitesTable.id, inviteId));

    return c.json({ success: true });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Delete invite error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to delete invite" }, 500);
  }
});

// ── POST /invites/accept ──────────────────────────────────────────────────────
// Accept an invite by token (no org context needed)
router.post("/invites/accept", async (c) => {
  try {
    const currentUser = c.get("user");
    const body = (await c.req.json()) as Record<string, unknown>;
    const parsed = AcceptInviteSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", message: parsed.error.message }, 400);
    }

    const { token } = parsed.data;
    const db = getDb();

    const inviteRows = await db
      .select()
      .from(organizationInvitesTable)
      .where(eq(organizationInvitesTable.token, token))
      .limit(1);

    if (inviteRows.length === 0) {
      return c.json({ error: "INVITE_NOT_FOUND", message: "Invite not found" }, 404);
    }

    const invite = inviteRows[0] as {
      id: string;
      orgId: string;
      email: string;
      role: string;
      token: string;
      invitedBy: string | null;
      expiresAt: Date;
      usedAt: Date | null;
    };

    if (invite.usedAt !== null) {
      return c.json({ error: "INVITE_USED", message: "Invite has already been used" }, 400);
    }

    if (invite.expiresAt < new Date()) {
      return c.json({ error: "INVITE_EXPIRED", message: "Invite has expired" }, 400);
    }

    if (invite.email.toLowerCase() !== currentUser.email.toLowerCase()) {
      return c.json(
        { error: "INVITE_EMAIL_MISMATCH", message: "Invite is for a different email address" },
        403
      );
    }

    // Check if already a member
    const existingMember = await db
      .select()
      .from(organizationMembersTable)
      .where(
        and(
          eq(organizationMembersTable.orgId, invite.orgId),
          eq(organizationMembersTable.userId, currentUser.id)
        )
      )
      .limit(1);

    if (existingMember.length > 0) {
      return c.json(
        { error: "ALREADY_MEMBER", message: "You are already a member of this organization" },
        409
      );
    }

    // Insert member
    const memberRows = await db
      .insert(organizationMembersTable)
      .values({
        orgId: invite.orgId,
        userId: currentUser.id,
        role: invite.role,
        invitedBy: invite.invitedBy,
        joinedAt: new Date(),
      })
      .returning();

    // Mark invite used
    await db
      .update(organizationInvitesTable)
      .set({ usedAt: new Date() })
      .where(eq(organizationInvitesTable.id, invite.id));

    // Get org info
    const orgRows = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, invite.orgId))
      .limit(1);

    const org = orgRows.length > 0 ? orgRows[0] : null;

    return c.json({ org, member: memberRows[0] });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    logger.error("Accept invite error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to accept invite" }, 500);
  }
});

// ── GET /orgs/:orgId/roles ────────────────────────────────────────────────────

router.get("/:orgId/roles", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");

  try {
    const db = getDb();
    const [member] = await db
      .select({ role: organizationMembersTable.role })
      .from(organizationMembersTable)
      .where(
        and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, user.id))
      )
      .limit(1);

    if (!member) return c.json({ error: "FORBIDDEN" }, 403);

    const custom = await db
      .select()
      .from(orgCustomRolesTable)
      .where(eq(orgCustomRolesTable.orgId, orgId));

    return c.json({
      system: ["owner", "admin", "member", "viewer"],
      permissions: ORG_PERMISSIONS,
      custom,
    });
  } catch (err) {
    logger.error("List org roles error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── POST /orgs/:orgId/roles ───────────────────────────────────────────────────

const customRoleSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string()).default([]),
  isDefault: z.boolean().optional().default(false),
});

router.post("/:orgId/roles", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");

  try {
    const db = getDb();
    const [member] = await db
      .select({ role: organizationMembersTable.role })
      .from(organizationMembersTable)
      .where(
        and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, user.id))
      )
      .limit(1);

    if (!member || !["owner", "admin"].includes(member.role)) {
      return c.json(
        { error: "FORBIDDEN", message: "Only owners and admins can manage roles" },
        403
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = customRoleSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

    const validPerms = parsed.data.permissions.filter((p) =>
      (ORG_PERMISSIONS as readonly string[]).includes(p)
    );

    const [role] = await db
      .insert(orgCustomRolesTable)
      .values({
        orgId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        permissions: validPerms,
        isDefault: parsed.data.isDefault,
      })
      .returning();

    return c.json(role, 201);
  } catch (err) {
    logger.error("Create org role error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── PUT /orgs/:orgId/roles/:roleId ────────────────────────────────────────────

router.put("/:orgId/roles/:roleId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  const roleId = c.req.param("roleId");

  try {
    const db = getDb();
    const [member] = await db
      .select({ role: organizationMembersTable.role })
      .from(organizationMembersTable)
      .where(
        and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, user.id))
      )
      .limit(1);

    if (!member || !["owner", "admin"].includes(member.role)) {
      return c.json({ error: "FORBIDDEN" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = customRoleSchema.partial().safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.description !== undefined) update.description = parsed.data.description;
    if (parsed.data.isDefault !== undefined) update.isDefault = parsed.data.isDefault;
    if (parsed.data.permissions !== undefined) {
      update.permissions = parsed.data.permissions.filter((p) =>
        (ORG_PERMISSIONS as readonly string[]).includes(p)
      );
    }

    const [updated] = await db
      .update(orgCustomRolesTable)
      .set(update)
      .where(and(eq(orgCustomRolesTable.id, roleId), eq(orgCustomRolesTable.orgId, orgId)))
      .returning();

    if (!updated) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json(updated);
  } catch (err) {
    logger.error("Update org role error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── DELETE /orgs/:orgId/roles/:roleId ─────────────────────────────────────────

router.delete("/:orgId/roles/:roleId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  const roleId = c.req.param("roleId");

  try {
    const db = getDb();
    const [member] = await db
      .select({ role: organizationMembersTable.role })
      .from(organizationMembersTable)
      .where(
        and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, user.id))
      )
      .limit(1);

    if (!member || !["owner", "admin"].includes(member.role)) {
      return c.json({ error: "FORBIDDEN" }, 403);
    }

    const deleted = await db
      .delete(orgCustomRolesTable)
      .where(and(eq(orgCustomRolesTable.id, roleId), eq(orgCustomRolesTable.orgId, orgId)))
      .returning();

    if (deleted.length === 0) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json({ success: true });
  } catch (err) {
    logger.error("Delete org role error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

export default router;
