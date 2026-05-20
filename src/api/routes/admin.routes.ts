import express from "express";
import { authMiddleware } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rateLimiting";
import { validate } from "../../middleware/validation";
import {
  AdminUpdateUserSchema,
  AdminAssignRoleSchema,
  JITApproveSchema,
  JITDenySchema,
  CreateRoleSchema,
} from "../schemas/admin.schema";
import { UserModel, SessionModel, JITModel, RoleModel, AuditModel } from "../../models";
import { revokeAllSessionsForUser, revokeSession } from "../../middleware/sessionControl";
import { getLogger } from "../../logger";
import { ErrorCodes } from "../../shared/types";

const router = express.Router();
const logger = getLogger("admin-routes");

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.user?.roles?.includes("admin")) {
    res
      .status(403)
      .json({ code: ErrorCodes.ACCESS_DENIED, message: "Admin access required", details: [] });
    return;
  }
  next();
}

// ── Users ────────────────────────────────────────────────────────────────────

router.get(
  "/users",
  rateLimit({ points: 60, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) || "20"), 100);
      const offset = parseInt((req.query.offset as string) || "0");
      const search = req.query.search as string | undefined;

      const filter: any = {};
      if (search) {
        filter.$or = [
          { email: { $regex: search, $options: "i" } },
          { displayName: { $regex: search, $options: "i" } },
        ];
      }

      const [users, total] = await Promise.all([
        UserModel.find(filter)
          .select("-passwordHash -mfa.totp.secret -mfa.totp.backupCodes")
          .skip(offset)
          .limit(limit)
          .lean(),
        UserModel.countDocuments(filter),
      ]);

      res.json({ users, total, limit, offset });
    } catch (err) {
      logger.error("Admin list users error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "Failed to list users", details: [] });
    }
  }
);

router.get(
  "/users/:id",
  rateLimit({ points: 60, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const user = await UserModel.findById(req.params.id)
        .select("-passwordHash -mfa.totp.secret -mfa.totp.backupCodes")
        .lean();
      if (!user)
        return res
          .status(404)
          .json({ code: ErrorCodes.USER_NOT_FOUND, message: "User not found", details: [] });
      res.json({ user });
    } catch (err) {
      logger.error("Admin get user error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get user", details: [] });
    }
  }
);

router.patch(
  "/users/:id",
  rateLimit({ points: 30, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  validate(AdminUpdateUserSchema),
  async (req, res) => {
    try {
      const { status, roles, displayName } = req.body as any;
      const update: any = {};
      if (status !== undefined) update.status = status;
      if (roles !== undefined) update.roles = roles;
      if (displayName !== undefined) update.displayName = displayName;

      const user = await UserModel.findByIdAndUpdate(req.params.id, update, { new: true }).select(
        "-passwordHash -mfa.totp.secret -mfa.totp.backupCodes"
      );
      if (!user)
        return res
          .status(404)
          .json({ code: ErrorCodes.USER_NOT_FOUND, message: "User not found", details: [] });

      if (status === "suspended" || status === "deleted") {
        await revokeAllSessionsForUser(req.params.id);
      }

      await AuditModel.create({
        action: "admin.user.update",
        actorId: req.user!._id,
        actorEmail: req.user!.email,
        targetId: req.params.id,
        targetType: "User",
        success: true,
        resourceDetails: update,
        timestamp: new Date(),
      });

      res.json({ user });
    } catch (err) {
      logger.error("Admin update user error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "Failed to update user", details: [] });
    }
  }
);

router.delete(
  "/users/:id",
  rateLimit({ points: 10, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      if (req.params.id === req.user!._id!.toString()) {
        return res.status(400).json({
          code: ErrorCodes.INVALID_REQUEST,
          message: "Cannot delete your own account",
          details: [],
        });
      }

      const user = await UserModel.findByIdAndUpdate(req.params.id, { status: "deleted" });
      if (!user)
        return res
          .status(404)
          .json({ code: ErrorCodes.USER_NOT_FOUND, message: "User not found", details: [] });

      await revokeAllSessionsForUser(req.params.id);

      await AuditModel.create({
        action: "admin.user.delete",
        actorId: req.user!._id,
        actorEmail: req.user!.email,
        targetId: req.params.id,
        targetType: "User",
        success: true,
        timestamp: new Date(),
      });

      res.json({ success: true });
    } catch (err) {
      logger.error("Admin delete user error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "Failed to delete user", details: [] });
    }
  }
);

// ── User Sessions ────────────────────────────────────────────────────────────

router.get(
  "/users/:id/sessions",
  rateLimit({ points: 60, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const sessions = await SessionModel.find({ userId: req.params.id })
        .sort({ lastActivityAt: -1 })
        .lean();
      res.json({ sessions });
    } catch (err) {
      logger.error("Admin list user sessions error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "Failed to list sessions", details: [] });
    }
  }
);

router.delete(
  "/users/:id/sessions",
  rateLimit({ points: 10, windowSecs: 60 }),
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const count = await revokeAllSessionsForUser(req.params.id);

      await AuditModel.create({
        action: "admin.sessions.revoke_all",
        actorId: req.user!._id,
        actorEmail: req.user!.email,
        targetId: req.params.id,
        targetType: "User",
        success: true,
        resourceDetails: { revokedCount: count },
        timestamp: new Date(),
      });

      res.json({ success: true, revokedCount: count });
    } catch (err) {
      logger.error("Admin revoke sessions error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to revoke sessions",
        details: [],
      });
    }
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
