/**
 * SCIM 2.0 (RFC 7644) — User provisioning endpoints
 * Mounted at /scim/v2
 *
 * Compatible with Azure AD, Okta, and other enterprise IdPs.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { eq, ilike, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { usersTable } from "../db/schema.js";
import { userToSCIM, scimToUserFields, scimError, parseSCIMFilter } from "./utils.js";
import type { SCIMListResponse, SCIMUser } from "./types.js";
import type { HonoEnv } from "../shared/types.js";

const router = new Hono<HonoEnv>();

// ─── Bearer Token Auth ────────────────────────────────────────────────────────

router.use("*", async (c, next) => {
  const token = process.env.SCIM_API_TOKEN;
  if (!token) {
    // If no token is configured, allow all (dev mode)
    return next();
  }

  const authHeader = c.req.header("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== token) {
    return c.json(scimError(401, "Invalid or missing Bearer token", "invalidValue"), 401);
  }
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
        { name: "userName", type: "string", required: true, uniqueness: "server" },
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
      description: "Group (maps to ZeroAuth Role)",
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

// ─── GET /Groups (stub) ───────────────────────────────────────────────────────

router.get("/Groups", (c) => {
  const startIndex = Math.max(1, parseInt(c.req.query("startIndex") ?? "1", 10));
  const response: SCIMListResponse<never> = {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 0,
    startIndex,
    itemsPerPage: 0,
    Resources: [],
  };
  return c.json(response);
});

// ─── POST /Groups (stub) ──────────────────────────────────────────────────────

router.post("/Groups", (c) => {
  return c.json(scimError(501, "Groups are not supported", "invalidValue"), 501);
});

export default router;
