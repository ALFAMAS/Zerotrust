import { randomBytes } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../../db";
import {
  organizationInvitesTable,
  organizationMembersTable,
  organizationsTable,
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
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("org-routes");

const createOrgSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80).optional(),
});
const updateOrgSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  logoUrl: z.string().url().nullable().optional(),
  billingEmail: z.string().email().nullable().optional(),
});
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});
const transferSchema = z.object({ newOwnerId: z.string().uuid() });
const securityPolicySchema = z.object({
  requirePasskeyAttestation: z.boolean().default(false),
  requireHardwarePasskey: z.boolean().default(false),
  allowedPasskeyAaguids: z.array(z.string()).default([]),
  deniedPasskeyAaguids: z.array(z.string()).default([]),
  ipAllowlist: z.array(z.string()).default([]),
  maxSessionAgeSeconds: z.number().int().min(0).default(0),
  idleTimeoutSeconds: z.number().int().min(0).default(0),
  maxConcurrentSessions: z.number().int().min(0).default(0),
  allowedCountries: z.array(z.string().length(2)).default([]),
});
const scimTokenSchema = z.object({ name: z.string().trim().min(1).max(100) });
const ssoConfigSchema = z.object({
  saml: z
    .object({
      enabled: z.boolean(),
      idpEntityId: z.string().optional(),
      idpSsoUrl: z.string().optional(),
      idpCert: z.string().optional(),
    })
    .optional(),
  oidc: z
    .object({
      enabled: z.boolean(),
      issuerUrl: z.string().optional(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      redirectUris: z.array(z.string()).optional(),
    })
    .optional(),
});

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `org-${randomBytes(4).toString("hex")}`;
}

async function getMembership(orgId: string, userId: string) {
  const db = getDb();
  const [membership] = await db
    .select()
    .from(organizationMembersTable)
    .where(
      and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
    )
    .limit(1);
  return membership;
}

async function requireMember(orgId: string, userId: string) {
  const membership = await getMembership(orgId, userId);
  return membership ?? null;
}

async function requireAdmin(orgId: string, userId: string) {
  const membership = await getMembership(orgId, userId);
  if (membership?.role === "owner" || membership?.role === "admin") return membership;
  return null;
}

async function requireOwner(orgId: string, userId: string) {
  const membership = await getMembership(orgId, userId);
  return membership?.role === "owner" ? membership : null;
}

function publicDbError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code);
    if (code === "23505") return "Organization slug is already in use";
    if (code === "23503") return "Unable to create organization for the current user";
  }
  return "Database operation failed";
}

router.use("*", authMiddleware);

router.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb();
  const orgs = await db
    .select({ member: organizationMembersTable, org: organizationsTable })
    .from(organizationMembersTable)
    .innerJoin(organizationsTable, eq(organizationMembersTable.orgId, organizationsTable.id))
    .where(eq(organizationMembersTable.userId, user.id));
  return c.json({ orgs });
});

router.post("/", async (c) => {
  const user = c.get("user");
  const parsed = createOrgSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);
  }

  const db = getDb();
  try {
    const slug = slugify(parsed.data.slug ?? parsed.data.name);
    const [org] = await db.transaction(async (tx) => {
      const [createdOrg] = await tx
        .insert(organizationsTable)
        .values({ name: parsed.data.name, slug, ownerId: user.id })
        .returning({
          id: organizationsTable.id,
          name: organizationsTable.name,
          slug: organizationsTable.slug,
          ownerId: organizationsTable.ownerId,
          createdAt: organizationsTable.createdAt,
          updatedAt: organizationsTable.updatedAt,
        });
      if (!createdOrg) throw new Error("Failed to create organization");
      await tx.insert(organizationMembersTable).values({
        orgId: createdOrg.id,
        userId: user.id,
        role: "owner",
        joinedAt: new Date(),
      });
      return [createdOrg];
    });
    return c.json({ org }, 201);
  } catch (error) {
    logger.error("Create org error", error as Error);
    return c.json({ error: "CREATE_ORG_FAILED", message: publicDbError(error) }, 500);
  }
});

router.get("/:orgId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireMember(orgId, user.id))) {
    return c.json({ error: "FORBIDDEN", message: "Not a member of this organization" }, 403);
  }
  const db = getDb();
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!org) return c.json({ error: "NOT_FOUND", message: "Organization not found" }, 404);
  const [memberCount] = await db
    .select({ count: count() })
    .from(organizationMembersTable)
    .where(eq(organizationMembersTable.orgId, orgId));
  return c.json({ org, memberCount: memberCount?.count ?? 0 });
});

router.put("/:orgId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  const parsed = updateOrgSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);
  const db = getDb();
  const [org] = await db
    .update(organizationsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(organizationsTable.id, orgId))
    .returning();
  return c.json({ org });
});

router.delete("/:orgId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireOwner(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  await getDb().delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  return c.json({ ok: true });
});

router.get("/:orgId/members", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireMember(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  const members = await getDb()
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
  return c.json({ members });
});

router.delete("/:orgId/members/:userId", async (c) => {
  const currentUser = c.get("user");
  const orgId = c.req.param("orgId");
  const userId = c.req.param("userId");
  const currentMembership = await getMembership(orgId, currentUser.id);
  if (!currentMembership) return c.json({ error: "FORBIDDEN" }, 403);
  if (currentMembership.role !== "owner" && currentUser.id !== userId) {
    return c.json({ error: "FORBIDDEN" }, 403);
  }
  const targetMembership = await getMembership(orgId, userId);
  if (targetMembership?.role === "owner") {
    return c.json({ error: "FORBIDDEN", message: "Owner cannot leave or be removed" }, 403);
  }
  await getDb()
    .delete(organizationMembersTable)
    .where(
      and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
    );
  return c.json({ ok: true });
});

router.post("/:orgId/transfer", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireOwner(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  const parsed = transferSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);
  const db = getDb();
  const newOwner = await getMembership(orgId, parsed.data.newOwnerId);
  if (!newOwner) return c.json({ error: "NOT_FOUND", message: "New owner must be a member" }, 404);
  await db.transaction(async (tx) => {
    await tx
      .update(organizationsTable)
      .set({ ownerId: parsed.data.newOwnerId, updatedAt: new Date() })
      .where(eq(organizationsTable.id, orgId));
    await tx
      .update(organizationMembersTable)
      .set({ role: "admin" })
      .where(
        and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, user.id))
      );
    await tx
      .update(organizationMembersTable)
      .set({ role: "owner" })
      .where(
        and(
          eq(organizationMembersTable.orgId, orgId),
          eq(organizationMembersTable.userId, parsed.data.newOwnerId)
        )
      );
  });
  return c.json({ ok: true });
});

router.get("/:orgId/invites", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  const invites = await getDb()
    .select()
    .from(organizationInvitesTable)
    .where(eq(organizationInvitesTable.orgId, orgId));
  return c.json({ invites });
});

router.post("/:orgId/invites", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  const parsed = inviteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [invite] = await getDb()
    .insert(organizationInvitesTable)
    .values({
      orgId,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      token,
      invitedBy: user.id,
      expiresAt,
    })
    .returning();
  return c.json({ invite }, 201);
});

router.delete("/:orgId/invites/:inviteId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  await getDb()
    .delete(organizationInvitesTable)
    .where(
      and(
        eq(organizationInvitesTable.orgId, orgId),
        eq(organizationInvitesTable.id, c.req.param("inviteId"))
      )
    );
  return c.json({ ok: true });
});

router.get("/:orgId/sso", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  const [org] = await getDb()
    .select({ ssoConfig: organizationsTable.ssoConfig })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  return c.json({ sso: org?.ssoConfig ?? {} });
});

router.put("/:orgId/sso", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  const parsed = ssoConfigSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);
  }
  const [org] = await getDb()
    .update(organizationsTable)
    .set({ ssoConfig: parsed.data, updatedAt: new Date() })
    .where(eq(organizationsTable.id, orgId))
    .returning({ ssoConfig: organizationsTable.ssoConfig });
  return c.json({ sso: org?.ssoConfig ?? {} });
});

router.post("/:orgId/sso/test", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  const [org] = await getDb()
    .select({ ssoConfig: organizationsTable.ssoConfig })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  const sso = org?.ssoConfig ?? {};
  return c.json({
    results: {
      saml: sso.saml?.enabled
        ? { status: sso.saml.idpEntityId && sso.saml.idpSsoUrl ? "success" : "error" }
        : undefined,
      oidc: sso.oidc?.enabled
        ? { status: sso.oidc.issuerUrl && sso.oidc.clientId ? "success" : "error" }
        : undefined,
    },
  });
});

router.get("/:orgId/security/policy", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  const db = getDb();
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
});

router.put("/:orgId/security/policy", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  const parsed = securityPolicySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);
  const [policy] = await getDb()
    .insert(orgSecurityPoliciesTable)
    .values({ orgId, ...parsed.data, updatedBy: user.id })
    .onConflictDoUpdate({
      target: orgSecurityPoliciesTable.orgId,
      set: { ...parsed.data, updatedAt: new Date(), updatedBy: user.id },
    })
    .returning();
  return c.json({ policy });
});

router.get("/:orgId/scim/tokens", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  return c.json({ tokens: await listOrgScimTokens(orgId) });
});

router.post("/:orgId/scim/tokens", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  const parsed = scimTokenSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);
  return c.json(
    await createOrgScimToken({ orgId, name: parsed.data.name, createdBy: user.id }),
    201
  );
});

router.post("/:orgId/scim/tokens/:tokenId/rotate", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  const result = await rotateOrgScimToken({
    orgId,
    tokenId: c.req.param("tokenId"),
    rotatedBy: user.id,
  });
  if (!result) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json(result);
});

router.delete("/:orgId/scim/tokens/:tokenId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  if (!(await requireAdmin(orgId, user.id))) return c.json({ error: "FORBIDDEN" }, 403);
  await revokeOrgScimToken(orgId, c.req.param("tokenId"));
  return c.json({ ok: true });
});

export default router;
