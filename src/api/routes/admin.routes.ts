import express from "express";
import type { Request, Response, NextFunction } from "express";
import { authMiddleware } from "../../middleware/auth";
import { getSettings, updateSettings } from "../../models/settings.model";
import { UserModel, SessionModel, AuditModel } from "../../models";
import { revokeAllSessionsForUser, revokeSession } from "../../middleware/sessionControl";
import { getLogger } from "../../logger";

const router = express.Router();
const logger = getLogger("admin-routes");

// ─── Admin guard ────────────────────────────────────────────────────────────

function adminGuard(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    return;
  }
  const roles: string[] = req.user.roles || [];
  if (!roles.includes("admin")) {
    res.status(403).json({ error: "FORBIDDEN", message: "Admin role required" });
    return;
  }
  next();
}

// All admin routes require auth + admin role
router.use(authMiddleware);
router.use(adminGuard);

// ─── Settings ────────────────────────────────────────────────────────────────

// GET /settings
router.get("/settings", async (_req, res) => {
  try {
    const settings = await getSettings();
    return res.status(200).json(settings);
  } catch (err) {
    logger.error("Admin get settings error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve settings" });
  }
});

// PUT /settings
router.put("/settings", async (req, res) => {
  try {
    const adminId = req.user!._id!.toString();
    const updated = await updateSettings(req.body, adminId);
    return res.status(200).json(updated);
  } catch (err) {
    logger.error("Admin update settings error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update settings" });
  }
});

// ─── Users ───────────────────────────────────────────────────────────────────

// GET /users?page=1&limit=20&search=&status=
router.get("/users", async (req, res) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20")));
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "";

    const filter: any = {};
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: "i" } },
        { displayName: { $regex: search, $options: "i" } },
      ];
    }
    if (status) {
      filter.status = status;
    }

    const [users, total] = await Promise.all([
      UserModel.find(filter)
        .select("-passwordHash -mfa.totp.secret -mfa.totp.backupCodes")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error("Admin list users error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list users" });
  }
});

// GET /users/:id
router.get("/users/:id", async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id)
      .select("-passwordHash -mfa.totp.secret -mfa.totp.backupCodes")
      .lean();

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    const sessionCount = await SessionModel.countDocuments({
      userId: req.params.id,
      isActive: true,
    });

    return res.status(200).json({ ...user, activeSessions: sessionCount });
  } catch (err) {
    logger.error("Admin get user error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to get user" });
  }
});

// PATCH /users/:id
router.patch("/users/:id", async (req, res) => {
  try {
    const allowed: Record<string, any> = {};
    if (req.body.displayName !== undefined) allowed.displayName = req.body.displayName;
    if (req.body.status !== undefined) {
      const validStatuses = ["active", "suspended", "pending", "deleted"];
      if (!validStatuses.includes(req.body.status)) {
        return res.status(400).json({ error: "INVALID_REQUEST", message: "Invalid status value" });
      }
      allowed.status = req.body.status;
    }

    const user = await UserModel.findByIdAndUpdate(
      req.params.id,
      { $set: allowed },
      { new: true }
    ).select("-passwordHash -mfa.totp.secret -mfa.totp.backupCodes");

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    return res.status(200).json(user);
  } catch (err) {
    logger.error("Admin update user error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update user" });
  }
});

// DELETE /users/:id
router.delete("/users/:id", async (req, res) => {
  try {
    const user = await UserModel.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "deleted" } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    // Revoke all sessions
    await revokeAllSessionsForUser(req.params.id);

    return res.status(200).json({ deleted: true, userId: req.params.id });
  } catch (err) {
    logger.error("Admin delete user error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to delete user" });
  }
});

// POST /users/:id/force-logout
router.post("/users/:id/force-logout", async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    const count = await revokeAllSessionsForUser(req.params.id);

    return res.status(200).json({ revoked: count });
  } catch (err) {
    logger.error("Admin force-logout error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to force logout" });
  }
});

// ─── Sessions ────────────────────────────────────────────────────────────────

// GET /sessions?userId=&active=true
router.get("/sessions", async (req, res) => {
  try {
    const filter: any = {};
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.active !== undefined) {
      filter.isActive = req.query.active === "true";
    }

    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20")));

    const [sessions, total] = await Promise.all([
      SessionModel.find(filter)
        .sort({ lastActivityAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SessionModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      sessions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error("Admin list sessions error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list sessions" });
  }
});

// DELETE /sessions/:id
router.delete("/sessions/:id", async (req, res) => {
  try {
    const session = await SessionModel.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "SESSION_NOT_FOUND", message: "Session not found" });
    }

    await revokeSession(req.params.id, "ADMIN_REVOKED");

    return res.status(200).json({ revoked: true });
  } catch (err) {
    logger.error("Admin revoke session error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to revoke session" });
  }
});

// ─── Stats ───────────────────────────────────────────────────────────────────

// GET /stats
router.get("/stats", async (_req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [totalUsers, activeSessions, recentSessionUsers, totalLogins24h] = await Promise.all([
      UserModel.countDocuments({ status: { $ne: "deleted" } }),
      SessionModel.countDocuments({ isActive: true }),
      // activeUsers: users with a session updated in the last 30 days
      SessionModel.distinct("userId", {
        lastActivityAt: { $gte: thirtyDaysAgo },
      }),
      // totalLogins24h: sessions created in last 24h (proxy for logins)
      SessionModel.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } }),
    ]);

    return res.status(200).json({
      totalUsers,
      activeUsers: recentSessionUsers.length,
      activeSessions,
      totalLogins24h,
    });
  } catch (err) {
    logger.error("Admin stats error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve stats" });
  }
});

export default router;
