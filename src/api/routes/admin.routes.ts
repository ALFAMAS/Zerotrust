import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, ilike, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { verifyAuditChain } from "../../audit/chain";
import { getDb, getReadDb } from "../../db";
import {
  auditLogsTable,
  feedbackTable,
  jitAccessTable,
  rolesTable,
  sessionsTable,
  usersTable,
} from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware, requireAdmin } from "../../middleware/auth";
import { revokeAllSessionsForUser, revokeSession } from "../../middleware/sessionControl";
import { getSettings, updateSettings } from "../../models/settings.model";
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  safeExtensionForContentType,
} from "../../services/uploadSafety";
import { countRows } from "../../shared/dbCount";
import { internalError } from "../../shared/httpErrors";
import { paginated, parsePaginatedQuery } from "../../shared/pagination";
import type { HonoEnv, User } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("admin-routes");

// Auth + admin guard on all admin routes
router.use("*", authMiddleware);
router.use("*", requireAdmin);

// GET /settings
router.get("/settings", async (c) => {
  try {
    const settings = await getSettings();
    return c.json(settings);
  } catch (err) {
    return internalError(c, logger, "Admin get settings error", err, "Failed to retrieve settings");
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
    return internalError(
      c,
      logger,
      "Admin update settings error",
      err,
      "Failed to update settings"
    );
  }
});

// GET /users?page=1&limit=20&search=&status=
router.get("/users", async (c) => {
  try {
    const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
    const search = c.req.query("search") || "";
    const status = c.req.query("status") || "";

    const db = getReadDb();
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

    const [users, total] = await Promise.all([
      db
        .select()
        .from(usersTable)
        .where(where)
        .orderBy(desc(usersTable.createdAt))
        .offset((page - 1) * limit)
        .limit(limit),
      countRows(db, usersTable, where),
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

    return c.json(paginated(sanitized, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "Admin list users error", err, "Failed to list users");
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
    const mfa = (u.mfa as User["mfa"] | null) ?? undefined;
    const passkeys = Array.isArray(u.passkeys) ? u.passkeys : [];
    const oauthProviders = Array.isArray(u.oauthProviders) ? u.oauthProviders : [];

    const activeSessions = await countRows(
      db,
      sessionsTable,
      and(eq(sessionsTable.userId, u.id), eq(sessionsTable.isActive, true))
    );

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
      activeSessions,
    });
  } catch (err) {
    return internalError(c, logger, "Admin get user error", err, "Failed to retrieve user");
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
    return internalError(c, logger, "Admin update user error", err, "Failed to update user");
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
    return internalError(c, logger, "Admin delete user error", err, "Failed to delete user");
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
    return internalError(c, logger, "Admin force logout error", err, "Failed to force logout");
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

    const [sessions, total] = await Promise.all([
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
      countRows(db, sessionsTable, whereClause),
    ]);

    return c.json(paginated(sessions, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "Admin list sessions error", err, "Failed to list sessions");
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
    return internalError(c, logger, "Admin revoke session error", err, "Failed to revoke session");
  }
});

// GET /stats
router.get("/stats", async (c) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const db = getReadDb();

    const [totalUsers, activeSessions, activeUserRows, totalLogins24h] = await Promise.all([
      countRows(db, usersTable, ne(usersTable.status, "deleted")),
      countRows(db, sessionsTable, eq(sessionsTable.isActive, true)),
      db
        .selectDistinct({ userId: sessionsTable.userId })
        .from(sessionsTable)
        .where(gt(sessionsTable.lastActivityAt, thirtyDaysAgo)),
      countRows(db, sessionsTable, gt(sessionsTable.createdAt, twentyFourHoursAgo)),
    ]);

    return c.json({
      totalUsers,
      activeUsers: activeUserRows.length,
      activeSessions,
      totalLogins24h,
    });
  } catch (err) {
    return internalError(c, logger, "Admin stats error", err, "Failed to retrieve stats");
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
    return internalError(c, logger, "Admin list roles error", err, "Failed to list roles");
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
    return internalError(c, logger, "Admin create role error", err, "Failed to create role");
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
    return internalError(c, logger, "Admin assign role error", err, "Failed to assign role");
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
    return internalError(c, logger, "Admin revoke role error", err, "Failed to remove role");
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
    return internalError(
      c,
      logger,
      "Admin list JIT grants error",
      err,
      "Failed to list JIT grants"
    );
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
    return internalError(c, logger, "Admin approve JIT error", err, "Failed to approve JIT grant");
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
    return internalError(c, logger, "Admin deny JIT error", err, "Failed to deny JIT grant");
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
    return internalError(c, logger, "Admin revoke JIT error", err, "Failed to revoke JIT grant");
  }
});

// ── Audit Logs ───────────────────────────────────────────────────────────────

// GET /audit-logs?page=1&limit=50&action=&actorId=
router.get("/audit-logs", async (c) => {
  try {
    const { page, limit, offset } = parsePaginatedQuery(c.req.query(), {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const action = c.req.query("action");
    const actorId = c.req.query("actorId");

    const db = getReadDb();
    const conditions: any[] = [];
    if (action) conditions.push(ilike(auditLogsTable.action, `%${action}%`));
    if (actorId) conditions.push(eq(auditLogsTable.actorId, actorId));

    const whereClause = conditions.length > 0 ? and(...(conditions as [any, ...any[]])) : undefined;

    const [logs, total] = await Promise.all([
      db
        .select()
        .from(auditLogsTable)
        .where(whereClause)
        .orderBy(desc(auditLogsTable.timestamp))
        .offset(offset)
        .limit(limit),
      countRows(db, auditLogsTable, whereClause),
    ]);

    return c.json(paginated(logs, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "Admin audit logs error", err, "Failed to fetch audit logs");
  }
});

// GET /audit-logs/verify?limit=1000 — verify the tamper-evidence hash chain
router.get("/audit-logs/verify", async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query("limit") || "1000", 10), 10000);
    const result = await verifyAuditChain(limit);
    return c.json(result);
  } catch (err) {
    return internalError(
      c,
      logger,
      "Admin audit chain verify error",
      err,
      "Failed to verify audit chain"
    );
  }
});

// ── GET /admin/feedback ───────────────────────────────────────────────────────

router.get("/feedback", async (c) => {
  try {
    const { page, limit, offset } = parsePaginatedQuery(c.req.query(), {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const type = c.req.query("type");

    const db = getReadDb();
    const where = type ? eq(feedbackTable.type, type) : undefined;
    const [rows, total] = await Promise.all([
      db
        .select()
        .from(feedbackTable)
        .where(where)
        .orderBy(desc(feedbackTable.createdAt))
        .offset(offset)
        .limit(limit),
      countRows(db, feedbackTable, where),
    ]);

    return c.json(paginated(rows, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "Admin feedback error", err);
  }
});

// ── Customer segments ──────────────────────────────────────────────────────────
// Admin endpoints for tagging accounts with customer segments.

const VALID_SEGMENTS = ["champion", "at_risk", "expansion", "new"] as const;

// GET /admin/users/segments?segment=&page=&limit= — list users by segment (or counts if no segment)
router.get("/users/segments", async (c) => {
  try {
    const segment = c.req.query("segment");
    const db = getDb();

    if (segment && VALID_SEGMENTS.includes(segment as (typeof VALID_SEGMENTS)[number])) {
      const { page, limit, offset } = parsePaginatedQuery(c.req.query);
      const where = eq(usersTable.customerSegment, segment);
      const [rows, total] = await Promise.all([
        db
          .select({
            id: usersTable.id,
            email: usersTable.email,
            displayName: usersTable.displayName,
            customerSegment: usersTable.customerSegment,
          })
          .from(usersTable)
          .where(where)
          .orderBy(desc(usersTable.createdAt))
          .offset(offset)
          .limit(limit),
        countRows(db, usersTable, where),
      ]);
      return c.json(paginated(rows, { page, limit, total }));
    }

    // No segment specified — return bounded counts per segment
    const rows = await db
      .select({
        segment: usersTable.customerSegment,
        count: sql<number>`count(*)::int`,
      })
      .from(usersTable)
      .where(sql`${usersTable.customerSegment} IS NOT NULL`)
      .groupBy(usersTable.customerSegment);
    return c.json({ segments: rows });
  } catch (err) {
    return internalError(c, logger, "Admin segments error", err);
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
    return internalError(c, logger, "Admin set segment error", err);
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
    return internalError(c, logger, "Admin lifecycle emails error", err);
  }
});

export default router;

// ── Webhook delivery logs ─────────────────────────────────────────────────────

// GET /admin/webhooks/:webhookId/deliveries — list delivery attempts
router.get("/webhooks/:webhookId/deliveries", async (c) => {
  try {
    const { webhookId } = c.req.param();
    const { page, limit, offset } = parsePaginatedQuery(c.req.query(), {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const { getDeliveryLogs, countDeliveryLogs } = await import(
      "../../services/webhookDeliveryLog.service.js"
    );
    const [logs, total] = await Promise.all([
      getDeliveryLogs(webhookId, limit, offset),
      countDeliveryLogs(webhookId),
    ]);
    return c.json(paginated(logs, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "Admin webhook deliveries error", err);
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

// ── File attachments ──────────────────────────────────────────────────────────

import { fileAttachmentsTable } from "../../db/schema";

// GET /admin/attachments — list file attachments (admin)
router.get("/attachments", async (c) => {
  try {
    const { page, limit, offset } = parsePaginatedQuery(c.req.query(), {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const feature = c.req.query("feature");
    const db = getDb();
    const conditions = feature ? eq(fileAttachmentsTable.feature, feature) : undefined;
    const [rows, total] = await Promise.all([
      db
        .select()
        .from(fileAttachmentsTable)
        .where(conditions)
        .orderBy(desc(fileAttachmentsTable.createdAt))
        .offset(offset)
        .limit(limit),
      countRows(db, fileAttachmentsTable, conditions),
    ]);
    return c.json(paginated(rows, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "Admin attachments error", err);
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

    // Validate file type and size. The stored extension is derived from the
    // server-validated content type (never the client filename) so a file that
    // claims image/png cannot be persisted/served as .html/.svg → stored XSS.
    const safeExt = safeExtensionForContentType(file.type);
    if (!safeExt) {
      return c.json(
        {
          error: "INVALID_FILE_TYPE",
          message: `Allowed types: ${ALLOWED_UPLOAD_CONTENT_TYPES.join(", ")}`,
        },
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
    const storageKey = `attachments/${Date.now()}-${randomUUID()}.${safeExt}`;
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
    return internalError(c, logger, "Admin attachment upload error", err);
  }
});
