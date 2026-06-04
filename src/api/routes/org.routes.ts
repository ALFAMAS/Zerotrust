import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { eq, and, isNull, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import {
  organizationsTable,
  organizationMembersTable,
  organizationInvitesTable,
  usersTable,
} from "../../db/schema";
import { authMiddleware } from "../../middleware/auth";
import { getLogger } from "../../logger";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("org-routes");

// ── Apply auth to all routes ──────────────────────────────────────────────────
router.use("*", authMiddleware);

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

export default router;
