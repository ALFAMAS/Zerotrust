/**
 * Session control helpers and middleware
 * - Enforce max concurrent devices per user
 * - Revoke sessions (oldest-first) when limit exceeded
 * - Helpers to revoke specific sessions or all sessions for a user
 */

import { SessionModel } from "../models";
import { getConfig } from "../config";
import { getLogger } from "../logger";
import type { Request, Response, NextFunction } from "express";
import { ErrorCodes } from "../shared/types";

const logger = getLogger("session-control");

/**
 * Enforce session limits for a user.
 * If the number of active sessions > allowed, revoke oldest sessions until within limit.
 * Returns list of revoked session IDs.
 */
export async function enforceMaxConcurrentDevices(userId: string, maxDevices?: number) {
  const cfg = getConfig();
  const allowed = maxDevices ?? cfg.session.maxConcurrentDevices;

  const activeSessions = await SessionModel.find({ userId, isActive: true }).sort({
    lastActivityAt: -1,
  });
  if (activeSessions.length <= allowed) return [];

  // Revoke oldest sessions beyond 'allowed'
  const toRevoke = activeSessions.slice(allowed).reverse(); // oldest first
  const revokedIds: string[] = [];
  for (const s of toRevoke) {
    s.isActive = false;
    s.revokedAt = new Date();
    s.revokedReason = "MAX_DEVICES_EXCEEDED";
    await s.save();
    revokedIds.push(s._id.toString());
    logger.info("Revoked session due to max devices", { userId, sessionId: s._id.toString() });
  }
  return revokedIds;
}

/** Revoke a single session by ID with optional reason */
export async function revokeSession(sessionId: string, reason = "manual_revocation") {
  const s = await SessionModel.findById(sessionId);
  if (!s) return false;
  s.isActive = false;
  s.revokedAt = new Date();
  s.revokedReason = reason;
  await s.save();
  logger.info("Session revoked", { sessionId, reason });
  return true;
}

/** Revoke all sessions for a user (optionally exclude currentSessionId) */
export async function revokeAllSessionsForUser(userId: string, excludeSessionId?: string) {
  const q: any = { userId, isActive: true };
  if (excludeSessionId) q._id = { $ne: excludeSessionId };
  const res = await SessionModel.updateMany(q, {
    isActive: false,
    revokedAt: new Date(),
    revokedReason: "ADMIN_REVOKE_ALL",
  });
  logger.info("Revoked all sessions for user", {
    userId,
    excluded: excludeSessionId,
    modifiedCount: res.modifiedCount,
  });
  return res.modifiedCount || 0;
}

/** Middleware to ensure current user hasn't exceeded device limits — intended for use on login completion */
export function requireSessionLimitOnLogin() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as any;
      if (!user || !user._id) return next();

      const maxDevices = user.sessionConfig?.maxDevices;
      const revoked = await enforceMaxConcurrentDevices(user._id.toString(), maxDevices);
      // Attach revoked session IDs to response locals for audit
      (res.locals as any).revokedSessions = revoked;
      next();
    } catch (err) {
      logger.error("Session limit enforcement failed", err as Error);
      res.status(500).json({ error: ErrorCodes.INTERNAL_ERROR, message: "Session control failed" });
    }
  };
}
