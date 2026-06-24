/**
 * SCIM 2.0 (RFC 7644) — User provisioning endpoints
 * Mounted at /scim/v2
 *
 * Compatible with Azure AD, Okta, and other enterprise IdPs.
 */

import { and, arrayContains, eq, ilike, sql } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { getDb } from "../db/index.js";
import { rolesTable, usersTable } from "../db/schema.js";
import { validateOrgScimToken } from "../services/orgScimToken.service.js";
import type { HonoEnv } from "../shared/types.js";
import type { SCIMGroup, SCIMListResponse, SCIMUser } from "./types.js";
import { groupToSCIM, parseSCIMFilter, scimError, scimToUserFields, userToSCIM } from "./utils.js";

const router = new Hono<HonoEnv>();

// ─── Bearer Token Auth ────────────────────────────────────────────────────────
//
// Three acceptance paths, in order:
//   1. SCIM_API_TOKEN env (legacy, single-token mode) — kept for backwards
//      compatibility with deployments that haven't migrated to per-org tokens.
//   2. Per-org token from the `org_scim_tokens` table (preferred).
//   3. No token configured at all → dev mode (open), for local development.
//
// In all authed paths, the resulting org context (if known) is exposed on
// `c.var.scimOrgId` so downstream handlers can scope operations.

router.use("*", async (c, next) => {
  const authHeader = c.req.header("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  // Legacy single-token mode.
  const legacyToken = process.env.SCIM_API_TOKEN;
  if (legacyToken) {
    if (!match || match[1] !== legacyToken) {
      return c.json(scimError(401, "Invalid or missing Bearer token", "invalidValue"), 401);
    }
    // No org scoping in legacy mode — handlers continue to operate on the
    // global user table, matching pre-existing behavior.
    return next();
  }

  if (!match) {
    // No env token configured and no Bearer header → dev mode (open).
    return next();
  }

  // Per-org token validation.
  const result = await validateOrgScimToken(match[1]);
  if (!result) {
    return c.json(scimError(401, "Invalid or missing Bearer token", "invalidValue"), 401);
  }
  c.set("scimOrgId", result.orgId);
  c.set("scimTokenId", result.tokenId);
  return next();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBaseUrl(c: Context): string {
  const proto = c.req.header("x-forwarded-proto") ?? "http";
  const host = c.req.header("host") ?? "localhost";
  return `${proto}://${host}`;
}

// ─── GET /ServiceProviderConfig ───────────────────────────────────────────────

router.get("/ServiceProviderConfig", (c) => {
  return c.json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "OAuth Bearer Token",
        description: "OAuth2 Bearer Token",
      },
    ],
  });
});

// ─── GET /Schemas ─────────────────────────────────────────────────────────────

router.get("/Schemas", (c) => {
  return c.json([
    {
      id: "urn:ietf:params:scim:schemas:core:2.0:User",
      name: "User",
      description: "User Account",
      schemas: ["urn:ietf:params:scim:meta:schemas:User"],
      attributes: [
        {
          name: "userName",
          type: "string",
          required: true,
          uniqueness: "server",
        },
        {
          name: "name",
          type: "complex",
          subAttributes: [
            { name: "givenName", type: "string" },
            { name: "familyName", type: "string" },
            { name: "formatted", type: "string" },
          ],
        },
        {
          name: "emails",
          type: "complex",
          multiValued: true,
          subAttributes: [
            { name: "value", type: "string" },
            { name: "primary", type: "boolean" },
            { name: "type", type: "string" },
          ],
        },
        {
          name: "phoneNumbers",
          type: "complex",
          multiValued: true,
          subAttributes: [
            { name: "value", type: "string" },
            { name: "type", type: "string" },
          ],
        },
        { name: "active", type: "boolean" },
        { name: "externalId", type: "string" },
        {
          name: "groups",
          type: "complex",
          multiValued: true,
          mutability: "readOnly",
          subAttributes: [
            { name: "value", type: "string" },
            { name: "display", type: "string" },
          ],
        },
      ],
      meta: {
        resourceType: "Schema",
        location: "/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User",
      },
    },
    {
      id: "urn:ietf:params:scim:schemas:core:2.0:Group",
      name: "Group",
      description: "Group (maps to zerotrust Role)",
      schemas: ["urn:ietf:params:scim:meta:schemas:Group"],
      attributes: [
        { name: "displayName", type: "string", required: true },
        { name: "externalId", type: "string" },
        {
          name: "members",
          type: "complex",
          multiValued: true,
          subAttributes: [
            { name: "value", type: "string" },
            { name: "display", type: "string" },
          ],
        },
      ],
      meta: {
        resourceType: "Schema",
        location: "/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:Group",
      },
    },
  ]);
});

// ─── GET /Users ───────────────────────────────────────────────────────────────

router.get("/Users", async (c) => {
  try {
    const baseUrl = getBaseUrl(c);
    const startIndex = Math.max(1, parseInt(c.req.query("startIndex") ?? "1", 10));
    const count = Math.min(200, Math.max(1, parseInt(c.req.query("count") ?? "100", 10)));
    const filterStr = c.req.query("filter");
    const skip = startIndex - 1;

    const db = getDb();

    let users: (typeof usersTable.$inferSelect)[];
    let totalResults: number;

    if (filterStr) {
      const parsed = parseSCIMFilter(filterStr);
      if (parsed && parsed.attribute === "userName" && parsed.operator === "eq") {
        const rows = await db
          .select()
          .from(usersTable)
          .where(ilike(usersTable.email, parsed.value))
          .offset(skip)
          .limit(count);
        const countResult = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(usersTable)
          .where(ilike(usersTable.email, parsed.value));
        users = rows;
        totalResults = countResult[0]?.count ?? 0;
      } else if (parsed && parsed.attribute === "externalId" && parsed.operator === "eq") {
        // No scimExternalId column — return empty
        users = [];
        totalResults = 0;
      } else {
        const rows = await db.select().from(usersTable).offset(skip).limit(count);
        const countResult = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
        users = rows;
        totalResults = countResult[0]?.count ?? 0;
      }
    } else {
      const rows = await db.select().from(usersTable).offset(skip).limit(count);
      const countResult = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
      users = rows;
      totalResults = countResult[0]?.count ?? 0;
    }

    const response: SCIMListResponse<SCIMUser> = {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults,
      startIndex,
      itemsPerPage: users.length,
      Resources: users.map((u) => userToSCIM(u, baseUrl)),
    };

    return c.json(response);
  } catch (err) {
    void err;
    return c.json(scimError(500, "Failed to list users"), 500);
  }
});

// ─── POST /Users ──────────────────────────────────────────────────────────────

router.post("/Users", async (c) => {
  try {
    const baseUrl = getBaseUrl(c);
    const scimUser = (await c.req.json()) as SCIMUser;

    if (!scimUser.userName) {
      return c.json(scimError(400, "userName is required", "invalidValue"), 400);
    }

    const fields = scimToUserFields(scimUser);
    const email = fields.email ?? scimUser.userName;

    const db = getDb();
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

    if (existing.length > 0) {
      return c.json(
        scimError(409, `User with userName '${scimUser.userName}' already exists`, "uniqueness"),
        409
      );
    }

    const nameParts = [scimUser.name?.givenName, scimUser.name?.familyName]
      .filter(Boolean)
      .join(" ");
    const displayName: string = (fields as any).displayName ?? (nameParts || scimUser.userName);

    const newUser: typeof usersTable.$inferInsert = {
      email,
      displayName,
      status: scimUser.active === false ? "suspended" : "active",
    };

    if (fields.phone) newUser.phone = fields.phone;
    if (scimUser.externalId) {
      newUser.metadata = { scimExternalId: scimUser.externalId };
    }

    await db.insert(usersTable).values(newUser);

    const inserted = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

    const scimResponse = userToSCIM(inserted[0], baseUrl);
    c.header("Location", scimResponse.meta?.location ?? "");
    return c.json(scimResponse, 201);
  } catch (err) {
    void err;
    return c.json(scimError(500, "Failed to provision user"), 500);
  }
});

// ─── GET /Users/:id ───────────────────────────────────────────────────────────

router.get("/Users/:id", async (c) => {
  try {
    const baseUrl = getBaseUrl(c);
    const id = c.req.param("id");
    const db = getDb();
    const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);

    if (rows.length === 0) {
      return c.json(scimError(404, "User not found"), 404);
    }

    return c.json(userToSCIM(rows[0], baseUrl));
  } catch (err) {
    void err;
    return c.json(scimError(500, "Failed to get user"), 500);
  }
});

// ─── PATCH /Users/:id ────────────────────────────────────────────────────────

router.patch("/Users/:id", async (c) => {
  try {
    const baseUrl = getBaseUrl(c);
    const id = c.req.param("id");
    const body = (await c.req.json()) as {
      schemas?: string[];
      Operations?: Array<{ op: string; path?: string; value?: unknown }>;
    };
    const { Operations } = body;

    if (!Array.isArray(Operations)) {
      return c.json(scimError(400, "Operations array is required", "invalidValue"), 400);
    }

    const update: Record<string, unknown> = {};

    for (const op of Operations) {
      const operation = op.op?.toLowerCase();
      if (operation !== "replace" && operation !== "add") continue;

      const path = op.path;
      const value = op.value;

      if (!path && typeof value === "object" && value !== null) {
        const obj = value as Record<string, unknown>;
        if (obj.active !== undefined) update.status = obj.active ? "active" : "suspended";
        if (obj.userName) update.email = obj.userName;
        if (typeof obj.name === "object" && obj.name) {
          const name = obj.name as Record<string, string>;
          const parts = [name.givenName, name.familyName].filter(Boolean);
          if (parts.length) update.displayName = parts.join(" ");
          else if (name.formatted) update.displayName = name.formatted;
        }
        if (Array.isArray(obj.emails)) {
          const primary = (obj.emails as Array<{ value: string; primary?: boolean }>).find(
            (e) => e.primary
          );
          if (primary) update.email = primary.value;
        }
        if (Array.isArray(obj.phoneNumbers)) {
          const phone = (obj.phoneNumbers as Array<{ value: string }>)[0];
          if (phone) update.phone = phone.value;
        }
      } else if (path === "active") {
        update.status = value ? "active" : "suspended";
      } else if (path === "userName") {
        update.email = value;
      } else if (path === "name.givenName" || path === "name.familyName") {
        (update as any)[`__name__${path.split(".")[1]}`] = value;
      } else if (path === 'emails[type eq "work"].value' || path === "emails") {
        if (typeof value === "string") update.email = value;
        else if (Array.isArray(value)) {
          const primary = (value as Array<{ value: string; primary?: boolean }>).find(
            (e) => e.primary
          );
          if (primary) update.email = primary.value;
        }
      } else if (path === 'phoneNumbers[type eq "work"].value' || path === "phoneNumbers") {
        if (typeof value === "string") update.phone = value;
        else if (Array.isArray(value)) {
          update.phone = (value as Array<{ value: string }>)[0]?.value;
        }
      }
    }

    // Reconcile name parts if set individually
    const givenName = (update as any).__name__givenName;
    const familyName = (update as any).__name__familyName;
    if (givenName !== undefined || familyName !== undefined) {
      const db = getDb();
      const current = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
      if (current.length > 0) {
        const currentParts = (current[0].displayName ?? "").split(/\s+/);
        const g = givenName ?? currentParts[0] ?? "";
        const f = familyName ?? (currentParts.length > 1 ? currentParts.slice(1).join(" ") : "");
        update.displayName = [g, f].filter(Boolean).join(" ") || current[0].displayName;
      }
      delete (update as any).__name__givenName;
      delete (update as any).__name__familyName;
    }

    const db = getDb();
    const updated = await db
      .update(usersTable)
      .set(update as Partial<typeof usersTable.$inferInsert>)
      .where(eq(usersTable.id, id))
      .returning();

    if (updated.length === 0) {
      return c.json(scimError(404, "User not found"), 404);
    }

    return c.json(userToSCIM(updated[0], baseUrl));
  } catch (err) {
    void err;
    return c.json(scimError(500, "Failed to patch user"), 500);
  }
});

// ─── DELETE /Users/:id ────────────────────────────────────────────────────────

router.delete("/Users/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = getDb();
    const updated = await db
      .update(usersTable)
      .set({ status: "suspended" })
      .where(eq(usersTable.id, id))
      .returning();

    if (updated.length === 0) {
      return c.json(scimError(404, "User not found"), 404);
    }

    return c.body(null, 204);
  } catch (err) {
    void err;
    return c.json(scimError(500, "Failed to de-provision user"), 500);
  }
});

// ─── Groups ───────────────────────────────────────────────────────────────────
//
// SCIM Groups map onto the `roles` table. A group's membership is derived from
// each user's `roles` array (which stores role *names*): a user is a member of a
// group iff their `roles` array contains that role's `name`. The role `name` is
// the stable internal identifier referenced by users and is never renamed once
// created — only the human-facing `displayName` is mutable — so membership links
// survive display-name changes.

type RoleRow = typeof rolesTable.$inferSelect;

/** Users whose `roles` array contains the given role name (group members). */
async function getGroupMembers(roleName: string): Promise<(typeof usersTable.$inferSelect)[]> {
  const db = getDb();
  return db
    .select()
    .from(usersTable)
    .where(arrayContains(usersTable.roles, [roleName]));
}

/** Add a role name to a user's `roles` array (idempotent). */
async function addRoleToUser(userId: string, roleName: string): Promise<void> {
  const db = getDb();
  await db
    .update(usersTable)
    .set({
      roles: sql`array_append(${usersTable.roles}, ${roleName})`,
      updatedAt: new Date(),
    })
    .where(and(eq(usersTable.id, userId), sql`NOT (${roleName} = ANY(${usersTable.roles}))`));
}

/** Remove a role name from a user's `roles` array. */
async function removeRoleFromUser(userId: string, roleName: string): Promise<void> {
  const db = getDb();
  await db
    .update(usersTable)
    .set({
      roles: sql`array_remove(${usersTable.roles}, ${roleName})`,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId));
}

/** Reconcile a group's membership to exactly `memberIds` (used by POST/PUT). */
async function setGroupMembers(roleName: string, memberIds: string[]): Promise<void> {
  const current = await getGroupMembers(roleName);
  const currentIds = new Set(current.map((u) => u.id));
  const wanted = new Set(memberIds);
  for (const id of wanted) if (!currentIds.has(id)) await addRoleToUser(id, roleName);
  for (const u of current) if (!wanted.has(u.id)) await removeRoleFromUser(u.id, roleName);
}

function memberIdsFromValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as Array<{ value?: string }>).map((m) => m?.value).filter(Boolean) as string[];
}

async function groupResponse(c: Context, role: RoleRow): Promise<SCIMGroup> {
  const members = await getGroupMembers(role.name);
  return groupToSCIM(role, members, getBaseUrl(c));
}

// ─── GET /Groups ────────────────────────────────────────────────────────────

router.get("/Groups", async (c) => {
  try {
    const startIndex = Math.max(1, parseInt(c.req.query("startIndex") ?? "1", 10));
    const count = Math.min(200, Math.max(1, parseInt(c.req.query("count") ?? "100", 10)));
    const filterStr = c.req.query("filter");
    const skip = startIndex - 1;
    const db = getDb();

    let roles: RoleRow[];
    let totalResults: number;

    const parsed = filterStr ? parseSCIMFilter(filterStr) : null;
    if (parsed && parsed.attribute === "displayName" && parsed.operator === "eq") {
      roles = await db
        .select()
        .from(rolesTable)
        .where(eq(rolesTable.displayName, parsed.value))
        .offset(skip)
        .limit(count);
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(rolesTable)
        .where(eq(rolesTable.displayName, parsed.value));
      totalResults = countResult[0]?.count ?? 0;
    } else {
      roles = await db.select().from(rolesTable).offset(skip).limit(count);
      const countResult = await db.select({ count: sql<number>`count(*)::int` }).from(rolesTable);
      totalResults = countResult[0]?.count ?? 0;
    }

    const Resources = await Promise.all(roles.map((r) => groupResponse(c, r)));
    const response: SCIMListResponse<SCIMGroup> = {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults,
      startIndex,
      itemsPerPage: Resources.length,
      Resources,
    };
    return c.json(response);
  } catch (err) {
    void err;
    return c.json(scimError(500, "Failed to list groups"), 500);
  }
});

// ─── POST /Groups ─────────────────────────────────────────────────────────────

router.post("/Groups", async (c) => {
  try {
    const group = (await c.req.json()) as SCIMGroup;
    if (!group.displayName) {
      return c.json(scimError(400, "displayName is required", "invalidValue"), 400);
    }

    const db = getDb();
    const existing = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.name, group.displayName))
      .limit(1);
    if (existing.length > 0) {
      return c.json(
        scimError(409, `Group '${group.displayName}' already exists`, "uniqueness"),
        409
      );
    }

    const [role] = await db
      .insert(rolesTable)
      .values({ name: group.displayName, displayName: group.displayName })
      .returning();

    await setGroupMembers(role.name, memberIdsFromValue(group.members));

    const scimResponse = await groupResponse(c, role);
    c.header("Location", scimResponse.meta?.location ?? "");
    return c.json(scimResponse, 201);
  } catch (err) {
    void err;
    return c.json(scimError(500, "Failed to create group"), 500);
  }
});

// ─── GET /Groups/:id ──────────────────────────────────────────────────────────

router.get("/Groups/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = getDb();
    const rows = await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1);
    if (rows.length === 0) return c.json(scimError(404, "Group not found"), 404);
    return c.json(await groupResponse(c, rows[0]));
  } catch (err) {
    void err;
    return c.json(scimError(500, "Failed to get group"), 500);
  }
});

// ─── PUT /Groups/:id (full replace) ───────────────────────────────────────────

router.put("/Groups/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const group = (await c.req.json()) as SCIMGroup;
    const db = getDb();
    const rows = await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1);
    if (rows.length === 0) return c.json(scimError(404, "Group not found"), 404);

    if (group.displayName && group.displayName !== rows[0].displayName) {
      await db
        .update(rolesTable)
        .set({ displayName: group.displayName, updatedAt: new Date() })
        .where(eq(rolesTable.id, id));
    }
    await setGroupMembers(rows[0].name, memberIdsFromValue(group.members));

    const [updated] = await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1);
    return c.json(await groupResponse(c, updated));
  } catch (err) {
    void err;
    return c.json(scimError(500, "Failed to update group"), 500);
  }
});

// ─── PATCH /Groups/:id (add / remove / replace members or displayName) ────────

router.patch("/Groups/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = (await c.req.json()) as {
      Operations?: Array<{ op: string; path?: string; value?: unknown }>;
    };
    if (!Array.isArray(body.Operations)) {
      return c.json(scimError(400, "Operations array is required", "invalidValue"), 400);
    }

    const db = getDb();
    const rows = await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1);
    if (rows.length === 0) return c.json(scimError(404, "Group not found"), 404);
    const roleName = rows[0].name;

    for (const op of body.Operations) {
      const operation = op.op?.toLowerCase();
      const path = op.path;

      // displayName updates (path-scoped or in a no-path replace bag).
      if (operation === "replace") {
        if (path === "displayName" && typeof op.value === "string") {
          await db
            .update(rolesTable)
            .set({ displayName: op.value, updatedAt: new Date() })
            .where(eq(rolesTable.id, id));
          continue;
        }
        if (!path && typeof op.value === "object" && op.value !== null) {
          const bag = op.value as Record<string, unknown>;
          if (typeof bag.displayName === "string") {
            await db
              .update(rolesTable)
              .set({ displayName: bag.displayName, updatedAt: new Date() })
              .where(eq(rolesTable.id, id));
          }
          if (bag.members !== undefined) {
            await setGroupMembers(roleName, memberIdsFromValue(bag.members));
          }
          continue;
        }
      }

      // Member mutations.
      if (path === "members") {
        if (operation === "add") {
          for (const uid of memberIdsFromValue(op.value)) await addRoleToUser(uid, roleName);
        } else if (operation === "replace") {
          await setGroupMembers(roleName, memberIdsFromValue(op.value));
        } else if (operation === "remove") {
          // No value → remove all members.
          if (op.value === undefined) await setGroupMembers(roleName, []);
          else
            for (const uid of memberIdsFromValue(op.value)) await removeRoleFromUser(uid, roleName);
        }
        continue;
      }

      // Targeted remove: members[value eq "userId"]
      const m = path?.match(/^members\[value eq "?([^"\]]+)"?\]$/i);
      if (m && operation === "remove") {
        await removeRoleFromUser(m[1], roleName);
      }
    }

    const [updated] = await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1);
    return c.json(await groupResponse(c, updated));
  } catch (err) {
    void err;
    return c.json(scimError(500, "Failed to patch group"), 500);
  }
});

// ─── DELETE /Groups/:id ───────────────────────────────────────────────────────

router.delete("/Groups/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = getDb();
    const rows = await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1);
    if (rows.length === 0) return c.json(scimError(404, "Group not found"), 404);

    // Strip the role from every member, then delete the role itself.
    await setGroupMembers(rows[0].name, []);
    await db.delete(rolesTable).where(eq(rolesTable.id, id));
    return c.body(null, 204);
  } catch (err) {
    void err;
    return c.json(scimError(500, "Failed to delete group"), 500);
  }
});

export default router;
