import { Hono } from "hono";
import { eq, and, ne, ilike, or, sql, desc, gt } from "drizzle-orm";
import { getDb } from "../../db";
import { usersTable, sessionsTable, auditLogsTable } from "../../db/schema";
import { authMiddleware } from "../../middleware/auth";
import { getSettings, updateSettings } from "../../models/settings.model";
import { revokeAllSessionsForUser, revokeSession } from "../../middleware/sessionControl";
import { getLogger } from "../../logger";
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
    const page = Math.max(1, parseInt(c.req.query("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20")));
    const search = c.req.query("search") || "";
    const status = c.req.query("status") || "";

    const db = getDb();

    const conditions: any[] = [];
    if (search) {
      conditions.push(or(ilike(usersTable.email, `%${search}%`), ilike(usersTable.displayName, `%${search}%`)));
    }
    if (status) {
      conditions.push(eq(usersTable.status, status));
    }

    const whereClause = conditions.length > 0 ? and(...(conditions as [any, ...any[]])) : undefined;

    const [users, countResult] = await Promise.all([
      db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          displayName: usersTable.displayName,
          username: usersTable.username,
          roles: usersTable.roles,
          status: usersTable.status,
          lastLoginAt: usersTable.lastLoginAt,
          createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .where(whereClause)
        .orderBy(desc(usersTable.createdAt))
        .offset((page - 1) * limit)
        .limit(limit),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    return c.json({
      users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error("Admin list users error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to list users" }, 500);
  }
});

// GET /users/:id
router.get("/users/:id", async (c) => {
  try {
    const db = getDb();
    const userRows = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        username: usersTable.username,
        phone: usersTable.phone,
        roles: usersTable.roles,
        status: usersTable.status,
        attributes: usersTable.attributes,
        lastLoginAt: usersTable.lastLoginAt,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, c.req.param("id")))
      .limit(1);

    if (userRows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessionsTable)
      .where(and(eq(sessionsTable.userId, c.req.param("id")), eq(sessionsTable.isActive, true)));

    return c.json({ ...userRows[0], activeSessions: count });
  } catch (err) {
    logger.error("Admin get user error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to get user" }, 500);
  }
});

// PATCH /users/:id
router.patch("/users/:id", async (c) => {
  try {
    const body = await c.req.json();
    const allowed: Record<string, any> = {};

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
      .returning({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName, status: usersTable.status });

    if (rows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }
    return c.json(rows[0]);
  } catch (err) {
    logger.error("Admin update user error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to update user" }, 500);
  }
);

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
);

// POST /users/:id/force-logout
router.post("/users/:id/force-logout", async (c) => {
  try {
    const id = c.req.param("id");
    const db = getDb();
    const userRows = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, id)).limit(1);

    if (userRows.length === 0) {
      return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
    }

    const count = await revokeAllSessionsForUser(id);
    return c.json({ revoked: count });
  } catch (err) {
    logger.error("Admin force-logout error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to force logout" }, 500);
  }
);

// GET /sessions?userId=&active=true
router.get("/sessions", async (c) => {
  try {
    const page = Math.max(1, parseInt(c.req.query("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20")));

    const db = getDb();
    const conditions: any[] = [];
    if (c.req.query("userId")) conditions.push(eq(sessionsTable.userId, c.req.query("userId")!));
    if (c.req.query("active") !== undefined) {
      conditions.push(eq(sessionsTable.isActive, c.req.query("active") === "true"));
    }
  }
);

    const whereClause = conditions.length > 0 ? and(...(conditions as [any, ...any[]])) : undefined;

    const [sessions, countResult] = await Promise.all([
      db.select().from(sessionsTable).where(whereClause).orderBy(desc(sessionsTable.lastActivityAt)).offset((page - 1) * limit).limit(limit),
      db.select({ count: sql<number>`count(*)::int` }).from(sessionsTable).where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    return c.json({ sessions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
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
    const rows = await db.select({ id: sessionsTable.id }).from(sessionsTable).where(eq(sessionsTable.id, id)).limit(1);

    if (rows.length === 0) {
      return c.json({ error: "SESSION_NOT_FOUND", message: "Session not found" }, 404);
    }

    await revokeSession(id, "ADMIN_REVOKED");
    return c.json({ revoked: true });
  } catch (err) {
    logger.error("Admin revoke session error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to revoke session" }, 500);
  }
);

// GET /stats
router.get("/stats", async (c) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const db = getDb();

    const [totalUsersRes, activeSessionsRes, activeUsersRes, logins24hRes] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(ne(usersTable.status, "deleted")),
      db.select({ count: sql<number>`count(*)::int` }).from(sessionsTable).where(eq(sessionsTable.isActive, true)),
      db.selectDistinct({ userId: sessionsTable.userId }).from(sessionsTable).where(gt(sessionsTable.lastActivityAt, thirtyDaysAgo)),
      db.select({ count: sql<number>`count(*)::int` }).from(sessionsTable).where(gt(sessionsTable.createdAt, twentyFourHoursAgo)),
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
);

router.delete(
  "/sessions/:id",
  rateLimit({ points: 30, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const ok = await revokeSession(req.params.id, "admin_revoked");
      if (!ok)
        return res
          .status(404)
          .json({ code: ErrorCodes.SESSION_NOT_FOUND, message: "Session not found", details: [] });
      res.json({ success: true });
    } catch (err) {
      logger.error("Admin revoke session error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to revoke session",
        details: [],
      });
    }
  }
);

// ── Roles ────────────────────────────────────────────────────────────────────

router.get(
  "/roles",
  rateLimit({ points: 60, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  async (_req, res) => {
    try {
      const roles = await RoleModel.find().lean();
      res.json({ roles });
    } catch (err) {
      logger.error("Admin list roles error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "Failed to list roles", details: [] });
    }
  }
);

router.post(
  "/roles",
  rateLimit({ points: 10, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  validate(CreateRoleSchema),
  async (req, res) => {
    try {
      const { name, displayName, description, parentRoleName, permissions } = req.body as any;

      const existing = await RoleModel.findOne({ name });
      if (existing)
        return res
          .status(409)
          .json({ code: "ROLE_EXISTS", message: "Role already exists", details: [] });

      let parentRoleId;
      if (parentRoleName) {
        const parentRole = await RoleModel.findOne({ name: parentRoleName });
        if (!parentRole)
          return res
            .status(404)
            .json({ code: "PARENT_ROLE_NOT_FOUND", message: "Parent role not found", details: [] });
        parentRoleId = parentRole._id;
      }

      const role = await RoleModel.create({
        name,
        displayName,
        description,
        parentRoleId,
        permissions,
        isSystem: false,
      });
      res.status(201).json({ role });
    } catch (err) {
      logger.error("Admin create role error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "Failed to create role", details: [] });
    }
  }
);

router.post(
  "/users/:id/roles",
  rateLimit({ points: 20, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  validate(AdminAssignRoleSchema),
  async (req, res) => {
    try {
      const { roleName } = req.body as any;
      const role = await RoleModel.findOne({ name: roleName });
      if (!role)
        return res
          .status(404)
          .json({ code: "ROLE_NOT_FOUND", message: "Role not found", details: [] });

      const user = await UserModel.findByIdAndUpdate(
        req.params.id,
        { $addToSet: { roles: roleName } },
        { new: true }
      ).select("-passwordHash -mfa.totp.secret");
      if (!user)
        return res
          .status(404)
          .json({ code: ErrorCodes.USER_NOT_FOUND, message: "User not found", details: [] });

      res.json({ success: true, roles: user.roles });
    } catch (err) {
      logger.error("Admin assign role error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "Failed to assign role", details: [] });
    }
  }
);

router.delete(
  "/users/:id/roles/:roleName",
  rateLimit({ points: 20, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const user = await UserModel.findByIdAndUpdate(
        req.params.id,
        { $pull: { roles: req.params.roleName } },
        { new: true }
      ).select("-passwordHash -mfa.totp.secret");
      if (!user)
        return res
          .status(404)
          .json({ code: ErrorCodes.USER_NOT_FOUND, message: "User not found", details: [] });

      res.json({ success: true, roles: user.roles });
    } catch (err) {
      logger.error("Admin revoke role error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "Failed to remove role", details: [] });
    }
  }
);

// ── JIT Grants ───────────────────────────────────────────────────────────────

router.get(
  "/jit-grants",
  rateLimit({ points: 60, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const filter: any = {};
      if (status) filter.status = status;

      const grants = await JITModel.find(filter)
        .populate("userId", "email displayName")
        .populate("roleId", "name displayName")
        .sort({ requestedAt: -1 })
        .lean();
      res.json({ grants });
    } catch (err) {
      logger.error("Admin list JIT grants error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to list JIT grants",
        details: [],
      });
    }
  }
);

router.post(
  "/jit-grants/:id/approve",
  rateLimit({ points: 20, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  validate(JITApproveSchema),
  async (req, res) => {
    try {
      const grant = await JITModel.findOneAndUpdate(
        { _id: req.params.id, status: "pending" },
        { status: "approved", approvedBy: req.user!._id, approvedAt: new Date() },
        { new: true }
      );
      if (!grant)
        return res.status(404).json({
          code: "JIT_NOT_FOUND",
          message: "JIT grant not found or already processed",
          details: [],
        });

      res.json({ success: true, grant });
    } catch (err) {
      logger.error("Admin approve JIT error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to approve JIT grant",
        details: [],
      });
    }
  }
);

router.post(
  "/jit-grants/:id/deny",
  rateLimit({ points: 20, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  validate(JITDenySchema),
  async (req, res) => {
    try {
      const grant = await JITModel.findOneAndUpdate(
        { _id: req.params.id, status: "pending" },
        { status: "denied" },
        { new: true }
      );
      if (!grant)
        return res.status(404).json({
          code: "JIT_NOT_FOUND",
          message: "JIT grant not found or already processed",
          details: [],
        });

      res.json({ success: true, grant });
    } catch (err) {
      logger.error("Admin deny JIT error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to deny JIT grant",
        details: [],
      });
    }
  }
);

router.delete(
  "/jit-grants/:id",
  rateLimit({ points: 10, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const grant = await JITModel.findOneAndUpdate(
        { _id: req.params.id, status: { $in: ["pending", "approved"] } },
        { status: "revoked", revokedAt: new Date(), revokedBy: req.user!._id },
        { new: true }
      );
      if (!grant)
        return res.status(404).json({
          code: "JIT_NOT_FOUND",
          message: "JIT grant not found or already in terminal state",
          details: [],
        });

      res.json({ success: true });
    } catch (err) {
      logger.error("Admin revoke JIT error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to revoke JIT grant",
        details: [],
      });
    }
  }
);

// ── Audit Logs ───────────────────────────────────────────────────────────────

router.get(
  "/audit-logs",
  rateLimit({ points: 30, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) || "50"), 200);
      const offset = parseInt((req.query.offset as string) || "0");
      const action = req.query.action as string | undefined;
      const actorId = req.query.actorId as string | undefined;

      const filter: any = {};
      if (action) filter.action = { $regex: action, $options: "i" };
      if (actorId) filter.actorId = actorId;

      const [logs, total] = await Promise.all([
        AuditModel.find(filter).sort({ timestamp: -1 }).skip(offset).limit(limit).lean(),
        AuditModel.countDocuments(filter),
      ]);

      res.json({ logs, total, limit, offset });
    } catch (err) {
      logger.error("Admin audit logs error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to fetch audit logs",
        details: [],
      });
    }
  }
);

export default router;
