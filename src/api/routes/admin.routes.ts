import { and, desc, eq, gt, ilike, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { verifyAuditChain } from "../../audit/chain";
import { getDb } from "../../db";
import {
  auditLogsTable,
  feedbackTable,
  jitAccessTable,
  rolesTable,
  sessionsTable,
  usersTable,
} from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { revokeAllSessionsForUser, revokeSession } from "../../middleware/sessionControl";
import { getSettings, updateSettings } from "../../models/settings.model";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("admin-routes");

// Auth + admin guard on all admin routes
router.use("*", authMiddleware);
router.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "UNAUTHORIZED", message: "Authentication required" }, 401);
  }
  if (!user.roles?.includes("admin")) {
    return c.json({ error: "FORBIDDEN", message: "Admin role required" }, 403);
  }
  return next();
});

// GET /settings
router.get("/settings", async (c) => {
  try {
    const settings = await getSettings();
    return c.json(settings);
  } catch (err) {
    logger.error("Admin get settings error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to retrieve settings" }, 500);
  }
});

// PUT /settings
router.put("/settings", async (c) => {
  try {
    const body = await c.req.json();
    const adminId = c.get("user").id;
    const updated = await updateSettings(body, adminId);
    return c.json(updated);
  } catch (err) {
    logger.error("Admin update settings error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to update settings" }, 500);
  }
});

// GET /users?page=1&limit=20&search=&status=
router.get("/users", async (c) => {
  try {
    const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
    const search = c.req.query("search") || "";
    const status = c.req.query("status") || "";

    const db = getDb();
    const conditions = [ne(usersTable.status, "deleted")];

    if (search) {
      conditions.push(
        or(ilike(usersTable.email, `%${search}%`), ilike(usersTable.displayName, `%${search}%`))!
      );
    }
    if (status) {
      conditions.push(eq(usersTable.status, status));
    }

    const where = and(...(conditions as [any, ...any[]]));

    const [users, countResult] = await Promise.all([
      db
        .select()
        .from(usersTable)
        .where(where)
        .orderBy(desc(usersTable.createdAt))
        .offset((page - 1) * limit)
        .limit(limit),
      db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(where),
    ]);

    const sanitized = users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      status: u.status,
      roles: u.roles,
      emailVerifiedAt: u.emailVerifiedAt,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));

    return c.json({ users: sanitized, total: countResult[0]?.count ?? 0, page, limit });
  } catch (err) {
    logger.error("Admin list users error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to list users" }, 500);
  }
});

// GET /users/:id
router.get("/users/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = getDb();
    const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);

    if (rows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }

    const u = rows[0];
    const mfa = (u.mfa ?? {}) as any;
    const passkeys = Array.isArray(u.passkeys) ? u.passkeys : [];
    const oauthProviders = Array.isArray(u.oauthProviders) ? u.oauthProviders : [];

    const activeSessionsRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessionsTable)
      .where(and(eq(sessionsTable.userId, u.id), eq(sessionsTable.isActive, true)));

    return c.json({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      username: u.username,
      phone: u.phone,
      status: u.status,
      roles: u.roles,
      locale: u.locale,
      emailVerifiedAt: u.emailVerifiedAt,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      lastLoginAt: u.lastLoginAt,
      mfa: {
        totpEnabled: Boolean(mfa?.totp?.enabled),
        webauthnEnabled: Boolean(mfa?.webauthn?.enabled) || passkeys.length > 0,
      },
      passkeyCount: passkeys.length,
      oauthProviders: oauthProviders
        .map((p: any) => (typeof p === "string" ? p : p?.provider))
        .filter(Boolean),
      activeSessions: activeSessionsRes[0]?.count ?? 0,
    });
  } catch (err) {
    logger.error("Admin get user error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to retrieve user" }, 500);
  }
});

// PATCH /users/:id
router.patch("/users/:id", async (c) => {
  try {
    const body = await c.req.json();
    const allowed: Record<string, unknown> = {};

    if (body.displayName !== undefined) allowed.displayName = body.displayName;
    if (body.status !== undefined) {
      const validStatuses = ["active", "suspended", "pending", "deleted"];
      if (!validStatuses.includes(body.status)) {
        return c.json({ error: "INVALID_REQUEST", message: "Invalid status value" }, 400);
      }
      allowed.status = body.status;
    }

    if (Object.keys(allowed).length === 0) {
      return c.json({ error: "INVALID_REQUEST", message: "No updatable fields provided" }, 400);
    }

    allowed.updatedAt = new Date();
    const db = getDb();
    const rows = await db
      .update(usersTable)
      .set(allowed)
      .where(eq(usersTable.id, c.req.param("id")))
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        status: usersTable.status,
      });

    if (rows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }
    return c.json(rows[0]);
  } catch (err) {
    logger.error("Admin update user error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to update user" }, 500);
  }
});

// DELETE /users/:id
router.delete("/users/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = getDb();
    const rows = await db
      .update(usersTable)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id });

    if (rows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }

    await revokeAllSessionsForUser(id);
    return c.json({ deleted: true, userId: id });
  } catch (err) {
    logger.error("Admin delete user error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to delete user" }, 500);
  }
});

// POST /users/:id/force-logout
router.post("/users/:id/force-logout", async (c) => {
  try {
    const id = c.req.param("id");
    const db = getDb();
    const userRows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    if (userRows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }

    const count = await revokeAllSessionsForUser(id);
    return c.json({ success: true, revokedSessions: count });
  } catch (err) {
    logger.error("Admin force logout error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to force logout" }, 500);
  }
});

// GET /sessions?userId=&active=true&page=1&limit=20
router.get("/sessions", async (c) => {
  try {
    const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));

    const db = getDb();
    const conditions: any[] = [];
    if (c.req.query("userId")) conditions.push(eq(sessionsTable.userId, c.req.query("userId")!));
    if (c.req.query("active") !== undefined) {
      conditions.push(eq(sessionsTable.isActive, c.req.query("active") === "true"));
    }

    const whereClause = conditions.length > 0 ? and(...(conditions as [any, ...any[]])) : undefined;

    const [sessions, countResult] = await Promise.all([
      db
        .select({
          id: sessionsTable.id,
          userId: sessionsTable.userId,
          userEmail: usersTable.email,
          userDisplayName: usersTable.displayName,
          deviceFingerprint: sessionsTable.deviceFingerprint,
          userAgent: sessionsTable.userAgent,
          ipAddress: sessionsTable.ipAddress,
          country: sessionsTable.country,
          isActive: sessionsTable.isActive,
          revokedAt: sessionsTable.revokedAt,
          revokedReason: sessionsTable.revokedReason,
          anomalyFlags: sessionsTable.anomalyFlags,
          createdAt: sessionsTable.createdAt,
          lastActivityAt: sessionsTable.lastActivityAt,
          expiresAt: sessionsTable.expiresAt,
        })
        .from(sessionsTable)
        .leftJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
        .where(whereClause)
        .orderBy(desc(sessionsTable.lastActivityAt))
        .offset((page - 1) * limit)
        .limit(limit),
      db.select({ count: sql<number>`count(*)::int` }).from(sessionsTable).where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    return c.json({
      sessions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error("Admin list sessions error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to list sessions" }, 500);
  }
});

// DELETE /sessions/:id
router.delete("/sessions/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = getDb();
    const rows = await db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(eq(sessionsTable.id, id))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: "SESSION_NOT_FOUND", message: "Session not found" }, 404);
    }

    await revokeSession(id, "ADMIN_REVOKED");
    return c.json({ revoked: true });
  } catch (err) {
    logger.error("Admin revoke session error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to revoke session" }, 500);
  }
});

// GET /stats
router.get("/stats", async (c) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const db = getDb();

    const [totalUsersRes, activeSessionsRes, activeUsersRes, logins24hRes] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(ne(usersTable.status, "deleted")),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sessionsTable)
        .where(eq(sessionsTable.isActive, true)),
      db
        .selectDistinct({ userId: sessionsTable.userId })
        .from(sessionsTable)
        .where(gt(sessionsTable.lastActivityAt, thirtyDaysAgo)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sessionsTable)
        .where(gt(sessionsTable.createdAt, twentyFourHoursAgo)),
    ]);

    return c.json({
      totalUsers: totalUsersRes[0]?.count ?? 0,
      activeUsers: activeUsersRes.length,
      activeSessions: activeSessionsRes[0]?.count ?? 0,
      totalLogins24h: logins24hRes[0]?.count ?? 0,
    });
  } catch (err) {
    logger.error("Admin stats error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to retrieve stats" }, 500);
  }
});

// ── Roles ────────────────────────────────────────────────────────────────────

// GET /roles
router.get("/roles", async (c) => {
  try {
    const db = getDb();
    const roles = await db.select().from(rolesTable).orderBy(rolesTable.name);
    return c.json({ roles });
  } catch (err) {
    logger.error("Admin list roles error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to list roles" }, 500);
  }
});

// POST /roles
router.post("/roles", async (c) => {
  try {
    const { name, displayName, description, parentRoleName, permissions } = await c.req.json();
    if (!name || !displayName) {
      return c.json(
        { error: "INVALID_REQUEST", message: "name and displayName are required" },
        400
      );
    }

    const db = getDb();
    const existing = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.name, name))
      .limit(1);
    if (existing.length > 0) {
      return c.json({ error: "ROLE_EXISTS", message: "Role already exists" }, 409);
    }

    let parentRoleId: string | undefined;
    if (parentRoleName) {
      const parentRows = await db
        .select({ id: rolesTable.id })
        .from(rolesTable)
        .where(eq(rolesTable.name, parentRoleName))
        .limit(1);
      if (parentRows.length === 0) {
        return c.json({ error: "PARENT_ROLE_NOT_FOUND", message: "Parent role not found" }, 404);
      }
      parentRoleId = parentRows[0].id;
    }

    const [role] = await db
      .insert(rolesTable)
      .values({
        name,
        displayName,
        description,
        parentRoleId,
        permissions: permissions || [],
        isSystem: false,
      })
      .returning();

    return c.json({ role }, 201);
  } catch (err) {
    logger.error("Admin create role error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to create role" }, 500);
  }
});

// POST /users/:id/roles — assign role to user
router.post("/users/:id/roles", async (c) => {
  try {
    const userId = c.req.param("id");
    const { roleName } = await c.req.json();
    if (!roleName) {
      return c.json({ error: "INVALID_REQUEST", message: "roleName is required" }, 400);
    }

    const db = getDb();
    const roleRows = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.name, roleName))
      .limit(1);
    if (roleRows.length === 0) {
      return c.json({ error: "ROLE_NOT_FOUND", message: "Role not found" }, 404);
    }

    const userRows = await db
      .select({ id: usersTable.id, roles: usersTable.roles })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (userRows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }

    const currentRoles = (userRows[0].roles as string[]) || [];
    if (!currentRoles.includes(roleName)) {
      const updatedRoles = [...currentRoles, roleName];
      await db
        .update(usersTable)
        .set({ roles: updatedRoles, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
      return c.json({ success: true, roles: updatedRoles });
    }

    return c.json({ success: true, roles: currentRoles });
  } catch (err) {
    logger.error("Admin assign role error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to assign role" }, 500);
  }
});

// DELETE /users/:id/roles/:roleName — revoke role from user
router.delete("/users/:id/roles/:roleName", async (c) => {
  try {
    const userId = c.req.param("id");
    const roleName = c.req.param("roleName");

    const db = getDb();
    const userRows = await db
      .select({ id: usersTable.id, roles: usersTable.roles })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (userRows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }

    const currentRoles = (userRows[0].roles as string[]) || [];
    const updatedRoles = currentRoles.filter((r) => r !== roleName);
    await db
      .update(usersTable)
      .set({ roles: updatedRoles, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    return c.json({ success: true, roles: updatedRoles });
  } catch (err) {
    logger.error("Admin revoke role error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to remove role" }, 500);
  }
});

// ── JIT Grants ───────────────────────────────────────────────────────────────

// GET /jit-grants?status=pending
router.get("/jit-grants", async (c) => {
  try {
    const status = c.req.query("status");
    const db = getDb();

    const conditions: any[] = [];
    if (status) conditions.push(eq(jitAccessTable.status, status));

    const grants = await db
      .select()
      .from(jitAccessTable)
      .where(conditions.length > 0 ? and(...(conditions as [any, ...any[]])) : undefined)
      .orderBy(desc(jitAccessTable.requestedAt));

    return c.json({ grants });
  } catch (err) {
    logger.error("Admin list JIT grants error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to list JIT grants" }, 500);
  }
});

// POST /jit-grants/:id/approve
router.post("/jit-grants/:id/approve", async (c) => {
  try {
    const id = c.req.param("id");
    const adminId = c.get("user").id;
    const db = getDb();

    const rows = await db
      .update(jitAccessTable)
      .set({
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(jitAccessTable.id, id), eq(jitAccessTable.status, "pending")))
      .returning();

    if (rows.length === 0) {
      return c.json(
        { error: "JIT_NOT_FOUND", message: "JIT grant not found or already processed" },
        404
      );
    }

    return c.json({ success: true, grant: rows[0] });
  } catch (err) {
    logger.error("Admin approve JIT error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to approve JIT grant" }, 500);
  }
});

// POST /jit-grants/:id/deny
router.post("/jit-grants/:id/deny", async (c) => {
  try {
    const id = c.req.param("id");
    const db = getDb();

    const rows = await db
      .update(jitAccessTable)
      .set({ status: "denied", updatedAt: new Date() })
      .where(and(eq(jitAccessTable.id, id), eq(jitAccessTable.status, "pending")))
      .returning();

    if (rows.length === 0) {
      return c.json(
        { error: "JIT_NOT_FOUND", message: "JIT grant not found or already processed" },
        404
      );
    }

    return c.json({ success: true, grant: rows[0] });
  } catch (err) {
    logger.error("Admin deny JIT error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to deny JIT grant" }, 500);
  }
});

// DELETE /jit-grants/:id — revoke an approved grant
router.delete("/jit-grants/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const adminId = c.get("user").id;
    const db = getDb();

    const rows = await db
      .update(jitAccessTable)
      .set({ status: "revoked", revokedAt: new Date(), revokedBy: adminId, updatedAt: new Date() })
      .where(and(eq(jitAccessTable.id, id)))
      .returning({ id: jitAccessTable.id });

    if (rows.length === 0) {
      return c.json({ error: "JIT_NOT_FOUND", message: "JIT grant not found" }, 404);
    }

    return c.json({ success: true });
  } catch (err) {
    logger.error("Admin revoke JIT error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to revoke JIT grant" }, 500);
  }
});

// ── Audit Logs ───────────────────────────────────────────────────────────────

// GET /audit-logs?limit=50&offset=0&action=&actorId=
router.get("/audit-logs", async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
    const offset = parseInt(c.req.query("offset") || "0", 10);
    const action = c.req.query("action");
    const actorId = c.req.query("actorId");

    const db = getDb();
    const conditions: any[] = [];
    if (action) conditions.push(ilike(auditLogsTable.action, `%${action}%`));
    if (actorId) conditions.push(eq(auditLogsTable.actorId, actorId));

    const whereClause = conditions.length > 0 ? and(...(conditions as [any, ...any[]])) : undefined;

    const [logs, countResult] = await Promise.all([
      db
        .select()
        .from(auditLogsTable)
        .where(whereClause)
        .orderBy(desc(auditLogsTable.timestamp))
        .offset(offset)
        .limit(limit),
      db.select({ count: sql<number>`count(*)::int` }).from(auditLogsTable).where(whereClause),
    ]);

    return c.json({ logs, total: countResult[0]?.count ?? 0, limit, offset });
  } catch (err) {
    logger.error("Admin audit logs error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to fetch audit logs" }, 500);
  }
});

// GET /audit-logs/verify?limit=1000 — verify the tamper-evidence hash chain
router.get("/audit-logs/verify", async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query("limit") || "1000", 10), 10000);
    const result = await verifyAuditChain(limit);
    return c.json(result);
  } catch (err) {
    logger.error("Admin audit chain verify error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to verify audit chain" }, 500);
  }
});

// ── GET /admin/feedback ───────────────────────────────────────────────────────

router.get("/feedback", async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);
    const type = c.req.query("type");

    const db = getDb();
    const where = type ? eq(feedbackTable.type, type) : undefined;
    const rows = await db
      .select()
      .from(feedbackTable)
      .where(where)
      .orderBy(desc(feedbackTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(feedbackTable)
      .where(where);

    return c.json({ feedback: rows, total: countResult?.count ?? 0, limit, offset });
  } catch (err) {
    logger.error("Admin feedback error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Customer segments ──────────────────────────────────────────────────────────
// Admin endpoints for tagging accounts with customer segments.

const VALID_SEGMENTS = ["champion", "at_risk", "expansion", "new"] as const;

// GET /admin/users/segments — list users by segment
router.get("/users/segments", async (c) => {
  try {
    const segment = c.req.query("segment");
    const db = getDb();

    let rows: any[];
    if (segment && VALID_SEGMENTS.includes(segment as any)) {
      rows = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          displayName: usersTable.displayName,
          customerSegment: usersTable.customerSegment,
        })
        .from(usersTable)
        .where(eq(usersTable.customerSegment, segment));
    } else {
      // Return counts per segment
      rows = await db
        .select({
          segment: usersTable.customerSegment,
          count: sql<number>`count(*)::int`,
        })
        .from(usersTable)
        .where(sql`${usersTable.customerSegment} IS NOT NULL`)
        .groupBy(usersTable.customerSegment);
    }

    return c.json({ segments: rows });
  } catch (err) {
    logger.error("Admin segments error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// PUT /admin/users/:id/segment — set customer segment for a user
router.put("/users/:id/segment", async (c) => {
  try {
    const userId = c.req.param("id");
    const { segment } = await c.req.json().catch(() => ({ segment: null }));

    if (segment !== null && !VALID_SEGMENTS.includes(segment)) {
      return c.json(
        {
          error: "INVALID_REQUEST",
          message: `Segment must be one of: ${VALID_SEGMENTS.join(", ")}`,
        },
        400
      );
    }

    const db = getDb();
    const [updated] = await db
      .update(usersTable)
      .set({ customerSegment: segment, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, customerSegment: usersTable.customerSegment });

    if (!updated) {
      return c.json({ error: "USER_NOT_FOUND" }, 404);
    }

    return c.json({ user: updated });
  } catch (err) {
    logger.error("Admin set segment error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Lifecycle emails ──────────────────────────────────────────────────────────

// POST /admin/lifecycle-emails — trigger lifecycle email batch (admin only)
router.post("/lifecycle-emails", async (c) => {
  try {
    const { sendLifecycleEmails } = await import("../../services/lifecycleEmail.service.js");
    const results = await sendLifecycleEmails();
    return c.json({ success: true, results });
  } catch (err) {
    logger.error("Admin lifecycle emails error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

export default router;

// ── Webhook delivery logs ─────────────────────────────────────────────────────

// GET /admin/webhooks/:webhookId/deliveries — list delivery attempts
router.get("/webhooks/:webhookId/deliveries", async (c) => {
  try {
    const { webhookId } = c.req.param();
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
    const { getDeliveryLogs } = await import("../../services/webhookDeliveryLog.service.js");
    const logs = await getDeliveryLogs(webhookId, limit);
    return c.json({ deliveries: logs });
  } catch (err) {
    logger.error("Admin webhook deliveries error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Pre-signed uploads ────────────────────────────────────────────────────────

// POST /admin/uploads/presigned — generate a pre-signed upload URL (admin+)
router.post("/uploads/presigned", async (c) => {
  try {
    const { contentType, fileName, maxSize } = await c.req.json().catch(() => ({}));
    if (!contentType || !fileName) {
      return c.json(
        { error: "INVALID_REQUEST", message: "contentType and fileName required" },
        400
      );
    }
    const { generatePresignedUploadUrl } = await import(
      "../../services/presignedUpload.service.js"
    );
    const result = await generatePresignedUploadUrl({ contentType, fileName, maxSize });
    return c.json(result);
  } catch (err: any) {
    logger.error("Admin presigned upload error", err as Error);
    return c.json({ error: "INVALID_REQUEST", message: err.message }, 400);
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────────

import {
  getFeatureUsage,
  getFunnelCounts,
  getZeroResultQueries,
  trackFunnelEvent,
} from "../../services/analytics.service";

// GET /admin/analytics/funnel — funnel conversion counts
router.get("/analytics/funnel", async (c) => {
  try {
    const days = Math.min(parseInt(c.req.query("days") ?? "30", 10), 365);
    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 86_400_000);
    const counts = await getFunnelCounts(startDate, endDate);
    return c.json({ funnel: counts, period: { startDate, endDate, days } });
  } catch (err) {
    logger.error("Admin funnel analytics error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /admin/analytics/features — per-feature usage counts
router.get("/analytics/features", async (c) => {
  try {
    const feature = c.req.query("feature");
    if (!feature)
      return c.json({ error: "INVALID_REQUEST", message: "feature query param required" }, 400);
    const days = Math.min(parseInt(c.req.query("days") ?? "30", 10), 365);
    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 86_400_000);
    const usage = await getFeatureUsage(feature, startDate, endDate);
    return c.json({ feature, usage, period: { startDate, endDate, days } });
  } catch (err) {
    logger.error("Admin feature analytics error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /admin/analytics/search — zero-result search queries
router.get("/analytics/search", async (c) => {
  try {
    const days = Math.min(parseInt(c.req.query("days") ?? "30", 10), 365);
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 86_400_000);
    const queries = await getZeroResultQueries(startDate, endDate, limit);
    return c.json({ zeroResultQueries: queries, period: { startDate, endDate, days } });
  } catch (err) {
    logger.error("Admin search analytics error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /admin/analytics/track — track a funnel event (for testing/integration)
router.post("/analytics/track", async (c) => {
  try {
    const { userId, step, metadata } = await c.req.json().catch(() => ({}));
    if (!userId || !step)
      return c.json({ error: "INVALID_REQUEST", message: "userId and step required" }, 400);
    await trackFunnelEvent({ userId, step, metadata });
    return c.json({ success: true });
  } catch (err) {
    logger.error("Admin track analytics error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── File attachments ──────────────────────────────────────────────────────────

import { fileAttachmentsTable } from "../../db/schema";

// GET /admin/attachments — list file attachments (admin)
router.get("/attachments", async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);
    const feature = c.req.query("feature");
    const db = getDb();
    const conditions = feature ? eq(fileAttachmentsTable.feature, feature) : undefined;
    const rows = await db
      .select()
      .from(fileAttachmentsTable)
      .where(conditions)
      .orderBy(desc(fileAttachmentsTable.createdAt))
      .limit(limit)
      .offset(offset);
    return c.json({ attachments: rows });
  } catch (err) {
    logger.error("Admin attachments error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Pricing / paywall experiments ─────────────────────────────────────────────

import {
  assignVariant,
  getExperimentResults,
  recordConversion,
  recordExposure,
  type Variant,
} from "../../services/experiments.service";

interface PricingExperiment {
  key: string;
  name: string;
  variants: Variant[];
  enabled: boolean;
}

// In-memory store for pricing experiments (can be moved to DB later)
const pricingExperiments = new Map<string, PricingExperiment>();

// Initialize default pricing experiments
pricingExperiments.set("pricing_page_v1", {
  key: "pricing_page_v1",
  name: "Pricing Page Layout",
  variants: [
    { name: "control", weight: 50 },
    { name: "highlight_pro", weight: 50 },
  ],
  enabled: true,
});

// GET /admin/experiments/pricing — list pricing experiments
router.get("/experiments/pricing", async (c) => {
  try {
    const experiments = Array.from(pricingExperiments.values());
    return c.json({ experiments });
  } catch (err) {
    logger.error("Admin pricing experiments error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /admin/experiments/pricing — create/update a pricing experiment
router.post("/experiments/pricing", async (c) => {
  try {
    const { key, name, variants, enabled } = await c.req.json().catch(() => ({}));
    if (!key || !name || !variants) {
      return c.json({ error: "INVALID_REQUEST", message: "key, name, and variants required" }, 400);
    }
    pricingExperiments.set(key, { key, name, variants, enabled: enabled ?? true });
    return c.json({ experiment: pricingExperiments.get(key) });
  } catch (err) {
    logger.error("Admin create pricing experiment error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /admin/experiments/pricing/:key/results — get experiment results
router.get("/experiments/pricing/:key/results", async (c) => {
  try {
    const key = c.req.param("key");
    const results = getExperimentResults(key);
    const experiment = pricingExperiments.get(key);
    return c.json({ experiment, results });
  } catch (err) {
    logger.error("Admin experiment results error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /admin/experiments/pricing/:key/expose — record an exposure
router.post("/experiments/pricing/:key/expose", async (c) => {
  try {
    const key = c.req.param("key");
    const { userId } = await c.req.json().catch(() => ({}));
    if (!userId) return c.json({ error: "INVALID_REQUEST", message: "userId required" }, 400);
    const experiment = pricingExperiments.get(key);
    if (!experiment) return c.json({ error: "NOT_FOUND", message: "Experiment not found" }, 404);
    const variant = assignVariant(key, userId, experiment.variants);
    if (variant) recordExposure(key, variant);
    return c.json({ variant });
  } catch (err) {
    logger.error("Admin experiment expose error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /admin/experiments/pricing/:key/convert — record a conversion
router.post("/experiments/pricing/:key/convert", async (c) => {
  try {
    const key = c.req.param("key");
    const { userId } = await c.req.json().catch(() => ({}));
    if (!userId) return c.json({ error: "INVALID_REQUEST", message: "userId required" }, 400);
    const experiment = pricingExperiments.get(key);
    if (!experiment) return c.json({ error: "NOT_FOUND", message: "Experiment not found" }, 404);
    // Find which variant this user was assigned to and record conversion
    const variant = assignVariant(key, userId, experiment.variants);
    if (variant) recordConversion(key, variant);
    return c.json({ success: true });
  } catch (err) {
    logger.error("Admin experiment convert error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /admin/attachments/upload — upload a file attachment
router.post("/attachments/upload", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const feature = formData.get("feature") as string | null;
    const featureRecordId = formData.get("feature_record_id") as string | null;
    const orgId = formData.get("org_id") as string | null;

    if (!file || !feature) {
      return c.json({ error: "INVALID_REQUEST", message: "file and feature required" }, 400);
    }

    // Validate file type and size
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      return c.json(
        { error: "INVALID_FILE_TYPE", message: `Allowed types: ${allowedTypes.join(", ")}` },
        400
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSize) {
      return c.json({ error: "FILE_TOO_LARGE", message: "Max file size is 10 MB" }, 400);
    }

    // Upload to S3 (stamped with a long-lived Cache-Control so an edge/CDN can
    // cache it) or fall back to local disk.
    const { uploadBuffer, isS3BackupEnabled, getUploadCacheControl } = await import(
      "../../services/objectStorage.service.js"
    );
    const cacheControl = getUploadCacheControl();
    const ext = file.name.split(".").pop() || "bin";
    const storageKey = `attachments/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let url: string;
    if (isS3BackupEnabled()) {
      // uploadBuffer returns the CDN/edge-aware delivery URL for the stored key.
      const uploaded = await uploadBuffer({
        key: storageKey,
        body: buffer,
        contentType: file.type,
        cacheControl,
      });
      url = uploaded.url;
    } else {
      // Fallback: store locally
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const uploadDir = path.join(process.cwd(), "uploads", "attachments");
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(path.join(uploadDir, storageKey.replace(/\//g, "_")), buffer);
      url = `/uploads/attachments/${storageKey.replace(/\//g, "_")}`;
    }

    // Record in database
    const db = getDb();
    const [attachment] = await db
      .insert(fileAttachmentsTable)
      .values({
        userId: user.id,
        orgId,
        feature,
        featureRecordId,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        storageKey,
      })
      .returning();

    return c.json({ attachment, url, cacheControl }, 201);
  } catch (err) {
    logger.error("Admin attachment upload error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});
