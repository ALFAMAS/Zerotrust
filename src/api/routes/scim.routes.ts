/**
 * SCIM 2.0 provisioning — Users + Groups MVP for enterprise IdP sync.
 * Authenticated via per-org bearer tokens (org_scim_tokens).
 */

import { randomBytes } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, getReadDb } from "../../db";
import {
  organizationMembersTable,
  organizationsTable,
  usersTable,
} from "../../db/schema";
import { getLogger } from "../../logger";
import { scimAuthMiddleware } from "../../middleware/scimAuth";
import {
  parseScimActive,
  parseScimDisplayName,
  parseScimUserName,
  toScimUser,
} from "../../scim/mappers";
import {
  SCIM_GROUP_SCHEMA,
  scimError,
  scimList,
  type ScimGroupResource,
} from "../../scim/types";
import { internalError } from "../../shared/httpErrors";
import { hashPassword } from "../../shared/passwordHash";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("scim");

router.use("*", scimAuthMiddleware);

async function orgMemberUserIds(orgId: string): Promise<string[]> {
  const db = getReadDb();
  const rows = await db
    .select({ userId: organizationMembersTable.userId })
    .from(organizationMembersTable)
    .where(eq(organizationMembersTable.orgId, orgId));
  return rows.map((r) => r.userId);
}

function baseUrl(c: { req: { url: string } }): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

// ── Users ─────────────────────────────────────────────────────────────────────

router.get("/Users", async (c) => {
  try {
    const orgId = c.get("scimOrgId")!;
    const userIds = await orgMemberUserIds(orgId);
    if (userIds.length === 0) {
      return c.json(scimList([]));
    }

    const db = getReadDb();
    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        status: usersTable.status,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .where(and(inArray(usersTable.id, userIds), ne(usersTable.status, "deleted")));

    const startIndex = parseInt(c.req.query("startIndex") ?? "1", 10) || 1;
    const count = parseInt(c.req.query("count") ?? "100", 10) || 100;
    const resources = users.map((u) => toScimUser(u, baseUrl(c)));
    return c.json(scimList(resources, startIndex, count));
  } catch (err) {
    return internalError(c, logger, "SCIM list users error", err);
  }
});

router.get("/Users/:id", async (c) => {
  try {
    const orgId = c.get("scimOrgId")!;
    const userId = c.req.param("id");
    const memberIds = await orgMemberUserIds(orgId);
    if (!memberIds.includes(userId)) {
      return c.json(scimError("User not found", 404), 404);
    }

    const db = getReadDb();
    const [user] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        status: usersTable.status,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user || user.status === "deleted") {
      return c.json(scimError("User not found", 404), 404);
    }

    return c.json(toScimUser(user, baseUrl(c)));
  } catch (err) {
    return internalError(c, logger, "SCIM get user error", err);
  }
});

router.post("/Users", async (c) => {
  try {
    const orgId = c.get("scimOrgId")!;
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const email = parseScimUserName(body);
    if (!email) {
      return c.json(scimError("userName or emails required", 400), 400);
    }

    const displayName = parseScimDisplayName(body) ?? email.split("@")[0] ?? "SCIM User";
    const active = parseScimActive(body) ?? true;
    const db = getDb();

    let [user] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        status: usersTable.status,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (!user) {
      const tempPassword = randomBytes(32).toString("base64url");
      const passwordHash = await hashPassword(tempPassword);
      [user] = await db
        .insert(usersTable)
        .values({
          email,
          displayName,
          passwordHash,
          status: active ? "active" : "suspended",
          emailVerifiedAt: new Date(),
        })
        .returning({
          id: usersTable.id,
          email: usersTable.email,
          displayName: usersTable.displayName,
          status: usersTable.status,
          createdAt: usersTable.createdAt,
          updatedAt: usersTable.updatedAt,
        });
    } else if (!active) {
      await db
        .update(usersTable)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      user = { ...user, status: "suspended" };
    }

    const [existingMember] = await db
      .select({ id: organizationMembersTable.id })
      .from(organizationMembersTable)
      .where(
        and(
          eq(organizationMembersTable.orgId, orgId),
          eq(organizationMembersTable.userId, user!.id)
        )
      )
      .limit(1);

    if (!existingMember) {
      await db.insert(organizationMembersTable).values({
        orgId,
        userId: user!.id,
        role: "member",
        joinedAt: new Date(),
      });
    }

    return c.json(toScimUser(user!, baseUrl(c)), 201);
  } catch (err) {
    return internalError(c, logger, "SCIM create user error", err);
  }
});

router.patch("/Users/:id", async (c) => {
  try {
    const orgId = c.get("scimOrgId")!;
    const userId = c.req.param("id");
    const memberIds = await orgMemberUserIds(orgId);
    if (!memberIds.includes(userId)) {
      return c.json(scimError("User not found", 404), 404);
    }

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };

    const displayName = parseScimDisplayName(body);
    if (displayName) updates.displayName = displayName;

    const active = parseScimActive(body);
    if (active === false) updates.status = "suspended";
    if (active === true) updates.status = "active";

    const db = getDb();
    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, userId))
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        status: usersTable.status,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      });

    if (!user) return c.json(scimError("User not found", 404), 404);
    return c.json(toScimUser(user, baseUrl(c)));
  } catch (err) {
    return internalError(c, logger, "SCIM patch user error", err);
  }
});

router.delete("/Users/:id", async (c) => {
  try {
    const orgId = c.get("scimOrgId")!;
    const userId = c.req.param("id");

    const db = getDb();
    const [removed] = await db
      .delete(organizationMembersTable)
      .where(
        and(
          eq(organizationMembersTable.orgId, orgId),
          eq(organizationMembersTable.userId, userId)
        )
      )
      .returning({ id: organizationMembersTable.id });

    if (!removed) return c.json(scimError("User not found", 404), 404);
    return c.body(null, 204);
  } catch (err) {
    return internalError(c, logger, "SCIM delete user error", err);
  }
});

// ── Groups (org as single group) ──────────────────────────────────────────────

async function orgAsScimGroup(orgId: string, reqBase: string): Promise<ScimGroupResource | null> {
  const db = getReadDb();
  const [org] = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      createdAt: organizationsTable.createdAt,
      updatedAt: organizationsTable.updatedAt,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!org) return null;

  const memberIds = await orgMemberUserIds(orgId);
  const users =
    memberIds.length > 0
      ? await db
          .select({ id: usersTable.id, displayName: usersTable.displayName })
          .from(usersTable)
          .where(inArray(usersTable.id, memberIds))
      : [];

  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: org.id,
    displayName: org.name,
    members: users.map((u) => ({ value: u.id, display: u.displayName })),
    meta: {
      resourceType: "Group",
      created: org.createdAt.toISOString(),
      lastModified: org.updatedAt.toISOString(),
      location: `${reqBase}/scim/v2/Groups/${org.id}`,
    },
  };
}

router.get("/Groups", async (c) => {
  try {
    const orgId = c.get("scimOrgId")!;
    const group = await orgAsScimGroup(orgId, baseUrl(c));
    if (!group) return c.json(scimList([]));
    return c.json(scimList([group]));
  } catch (err) {
    return internalError(c, logger, "SCIM list groups error", err);
  }
});

router.get("/Groups/:id", async (c) => {
  try {
    const orgId = c.get("scimOrgId")!;
    const groupId = c.req.param("id");
    if (groupId !== orgId) {
      return c.json(scimError("Group not found", 404), 404);
    }
    const group = await orgAsScimGroup(orgId, baseUrl(c));
    if (!group) return c.json(scimError("Group not found", 404), 404);
    return c.json(group);
  } catch (err) {
    return internalError(c, logger, "SCIM get group error", err);
  }
});

export default router;
