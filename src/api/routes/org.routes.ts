import { randomBytes } from "node:crypto";
import { acceptOrgInviteSchema, createOrgSchema, orgInviteSchema } from "@zerotrust/shared-types";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, getReadDb } from "../../db";
import {
  acceptOrgInvite,
  createOrganizationWithOwner,
  listOrganizationsForUser,
  listOrgInvites,
  listOrgMembers,
  listPendingInvitesForEmail,
  transferOrganizationOwnership,
} from "../../db/repositories/orgs.repository";
import {
  notificationsTable,
  organizationInvitesTable,
  organizationMembersTable,
  organizationsTable,
  orgFeatureFlagsTable,
  orgSecurityPoliciesTable,
  usersTable,
} from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware, requireEmailVerified } from "../../middleware/auth";
import { sensitiveReverification } from "../../middleware/continuousVerification";
import { orgRlsMiddleware } from "../../middleware/orgRls";
import { sendOrgInviteEmail } from "../../services/notifications/email.service";
import { countRows } from "../../shared/dbCount";
import { listOrgFeatureFlags } from "../../shared/featureFlags";
import { paginated, parsePaginatedQuery } from "../../shared/pagination";
import {
  AuthorizationError,
  assertCan,
  authorizeOrg,
  type OrgMembershipContext,
} from "../../shared/permissions";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("org-routes");

const updateOrgSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  logoUrl: z.string().url().nullable().optional(),
  billingEmail: z.string().email().nullable().optional(),
  version: z.number().int().nonnegative().optional(),
});
const INVITE_TTL_DAYS = 7;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
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

async function getMembership(orgId: string, userId: string): Promise<OrgMembershipContext | null> {
  const db = getDb();
  const [membership] = await db
    .select()
    .from(organizationMembersTable)
    .where(
      and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
    )
    .limit(1);
  if (!membership) return null;
  return { orgId: membership.orgId, userId: membership.userId, role: membership.role };
}

function forbiddenResponse(c: { json: (body: unknown, status: number) => Response }, err: unknown) {
  if (err instanceof AuthorizationError) {
    return c.json({ error: err.code, message: err.message }, 403);
  }
  throw err;
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
router.use("*", orgRlsMiddleware());

router.get("/", async (c) => {
  const user = c.get("user");
  const orgs = await listOrganizationsForUser(user.id);
  return c.json({ orgs });
});

router.post("/", requireEmailVerified, async (c) => {
  const user = c.get("user");
  const parsed = createOrgSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);
  }
  try {
    const slug = slugify(parsed.data.slug ?? parsed.data.name);
    const org = await createOrganizationWithOwner({
      name: parsed.data.name,
      slug,
      ownerId: user.id,
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
  try {
    await authorizeOrg(user, "org:read", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
  const db = getReadDb();
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!org) return c.json({ error: "NOT_FOUND", message: "Organization not found" }, 404);
  const memberCount = await countRows(
    db,
    organizationMembersTable,
    eq(organizationMembersTable.orgId, orgId)
  );
  return c.json({ org, memberCount });
});

router.put("/:orgId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  try {
    await authorizeOrg(user, "org:update", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
  const parsed = updateOrgSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);
  const { version: expectedVersion, ...updates } = parsed.data;
  const db = getDb();
  const setPayload = { ...updates, updatedAt: new Date() };

  if (expectedVersion !== undefined) {
    const [org] = await db
      .update(organizationsTable)
      .set({ ...setPayload, version: sql`${organizationsTable.version} + 1` })
      .where(and(eq(organizationsTable.id, orgId), eq(organizationsTable.version, expectedVersion)))
      .returning();
    if (!org) {
      return c.json(
        {
          error: "VERSION_CONFLICT",
          message: "Organization was modified elsewhere; refresh and retry",
        },
        409
      );
    }
    return c.json({ org });
  }

  const [org] = await db
    .update(organizationsTable)
    .set({ ...setPayload, version: sql`${organizationsTable.version} + 1` })
    .where(eq(organizationsTable.id, orgId))
    .returning();
  return c.json({ org });
});

router.delete("/:orgId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  try {
    await authorizeOrg(user, "org:delete", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
  await getDb().delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  return c.json({ ok: true });
});

router.get("/:orgId/members", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  try {
    await authorizeOrg(user, "members:read", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
  const { page, limit, offset } = parsePaginatedQuery(c.req.query());
  const { members, total } = await listOrgMembers(orgId, { page, limit, offset });
  return c.json(paginated(members, { page, limit, total }));
});

router.delete("/:orgId/members/:userId", async (c) => {
  const currentUser = c.get("user");
  const orgId = c.req.param("orgId");
  const userId = c.req.param("userId");
  const currentMembership = await getMembership(orgId, currentUser.id);
  try {
    assertCan(
      currentUser,
      "members:remove",
      { type: "org", orgId },
      { membership: currentMembership }
    );
  } catch (err) {
    return forbiddenResponse(c, err);
  }
  if (currentMembership!.role !== "owner" && currentUser.id !== userId) {
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

router.post("/:orgId/transfer", sensitiveReverification, async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  try {
    await authorizeOrg(user, "org:transfer", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
  const parsed = transferSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);
  const newOwner = await getMembership(orgId, parsed.data.newOwnerId);
  if (!newOwner) return c.json({ error: "NOT_FOUND", message: "New owner must be a member" }, 404);
  await transferOrganizationOwnership({
    orgId,
    currentOwnerId: user.id,
    newOwnerId: parsed.data.newOwnerId,
  });
  return c.json({ ok: true });
});

router.get("/:orgId/invites", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  try {
    await authorizeOrg(user, "invites:read", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
  const { page, limit, offset } = parsePaginatedQuery(c.req.query());
  const { invites, total } = await listOrgInvites(orgId, { page, limit, offset });
  return c.json(paginated(invites, { page, limit, total }));
});

router.post("/:orgId/invites", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  try {
    await authorizeOrg(user, "invites:manage", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
  const parsed = orgInviteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);
  const email = parsed.data.email.toLowerCase();
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const db = getDb();
  const [invite] = await db
    .insert(organizationInvitesTable)
    .values({
      orgId,
      email,
      role: parsed.data.role,
      token,
      invitedBy: user.id,
      expiresAt,
    })
    .returning();

  // Notify + email the invitee. Non-blocking: the invite row is the source of
  // truth, so a slow/failed notification or email must never fail the request.
  void (async () => {
    try {
      const [org] = await db
        .select({ name: organizationsTable.name })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, orgId))
        .limit(1);
      const orgName = org?.name ?? "an organization";
      const acceptUrl = `${APP_URL}/invite/${token}`;

      const [invitedUser] = await db
        .select({ id: usersTable.id, displayName: usersTable.displayName })
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);

      if (invitedUser) {
        await db.insert(notificationsTable).values({
          userId: invitedUser.id,
          type: "info",
          title: `You've been invited to join ${orgName}`,
          body: `${user.displayName ?? user.email} invited you to join ${orgName} as ${parsed.data.role}.`,
          link: "/dashboard/organizations",
        });
      }

      await sendOrgInviteEmail(email, {
        inviterName: user.displayName ?? user.email,
        orgName,
        role: parsed.data.role,
        acceptUrl,
        expiresInDays: INVITE_TTL_DAYS,
      });
    } catch (err) {
      logger.error("Failed to notify/email org invite", err as Error);
    }
  })();

  return c.json({ invite }, 201);
});

router.get("/invites/mine", async (c) => {
  const user = c.get("user");
  const { page, limit, offset } = parsePaginatedQuery(c.req.query());
  const { invites, total } = await listPendingInvitesForEmail(user.email, { page, limit, offset });
  return c.json(paginated(invites, { page, limit, total }));
});

router.post("/invites/accept", async (c) => {
  const user = c.get("user");
  const parsed = acceptOrgInviteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);

  const result = await acceptOrgInvite({
    token: parsed.data.token,
    userId: user.id,
    userEmail: user.email,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return c.json({ error: "NOT_FOUND", message: "Invite not found or already used" }, 404);
    }
    if (result.reason === "expired") {
      return c.json({ error: "INVITE_EXPIRED", message: "This invite has expired" }, 410);
    }
    return c.json(
      { error: "FORBIDDEN", message: "This invite was sent to a different email address" },
      403
    );
  }

  return c.json({ org: result.org, member: result.member });
});

router.delete("/invites/:inviteId", async (c) => {
  const user = c.get("user");
  const inviteId = c.req.param("inviteId");
  const db = getDb();
  const [invite] = await db
    .select({ id: organizationInvitesTable.id, email: organizationInvitesTable.email })
    .from(organizationInvitesTable)
    .where(eq(organizationInvitesTable.id, inviteId))
    .limit(1);
  if (!invite || invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return c.json({ error: "NOT_FOUND", message: "Invite not found" }, 404);
  }
  await db.delete(organizationInvitesTable).where(eq(organizationInvitesTable.id, inviteId));
  return c.json({ ok: true });
});

router.delete("/:orgId/invites/:inviteId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  try {
    await authorizeOrg(user, "invites:manage", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
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

router.get("/:orgId/security/policy", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  try {
    await authorizeOrg(user, "security:read", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
  const db = getReadDb();
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
  try {
    await authorizeOrg(user, "security:manage", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
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

const featureFlagSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_.-]+$/i),
  enabled: z.boolean(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

router.get("/:orgId/feature-flags", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  try {
    await authorizeOrg(user, "org:read", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
  const flags = await listOrgFeatureFlags(orgId);
  return c.json({ flags });
});

router.put("/:orgId/feature-flags/:key", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  const key = c.req.param("key");
  try {
    await authorizeOrg(user, "org:update", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
  const parsed = featureFlagSchema.safeParse({
    ...(await c.req.json().catch(() => ({}))),
    key,
  });
  if (!parsed.success) {
    return c.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, 400);
  }
  const { enabled, rolloutPercent, metadata } = parsed.data;
  const [flag] = await getDb()
    .insert(orgFeatureFlagsTable)
    .values({
      orgId,
      key,
      enabled,
      rolloutPercent: rolloutPercent ?? 100,
      metadata: metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [orgFeatureFlagsTable.orgId, orgFeatureFlagsTable.key],
      set: {
        enabled,
        rolloutPercent: rolloutPercent ?? 100,
        metadata: metadata ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();
  return c.json({ flag });
});

router.delete("/:orgId/feature-flags/:key", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("orgId");
  const key = c.req.param("key");
  try {
    await authorizeOrg(user, "org:update", orgId, getMembership);
  } catch (err) {
    return forbiddenResponse(c, err);
  }
  await getDb()
    .delete(orgFeatureFlagsTable)
    .where(and(eq(orgFeatureFlagsTable.orgId, orgId), eq(orgFeatureFlagsTable.key, key)));
  return c.body(null, 204);
});

export default router;
