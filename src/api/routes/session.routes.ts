import express from "express";
import { authMiddleware } from "../../middleware/auth";
import { SessionModel } from "../../models";
import { revokeSession, revokeAllSessionsForUser } from "../../middleware/sessionControl";
import { getLogger } from "../../logger";

const router = express.Router();
const logger = getLogger("session-routes");

// All session routes require authentication
router.use(authMiddleware);

// GET / — list user's own sessions
router.get("/", async (req, res) => {
  try {
    const userId = req.user!._id!.toString();
    const sessions = await SessionModel.find({ userId })
      .sort({ lastActivityAt: -1 })
      .lean();

    const sanitized = sessions.map((s) => ({
      id: s._id.toString(),
      ipAddress: s.ipAddress,
      country: s.country,
      userAgent: s.userAgent,
      deviceFingerprint: s.deviceFingerprint
        ? {
            platform: (s.deviceFingerprint as any).platform,
            browser: (s.deviceFingerprint as any).browser,
            os: (s.deviceFingerprint as any).os,
            isTrusted: (s.deviceFingerprint as any).isTrusted,
          }
        : null,
      isActive: s.isActive,
      expiresAt: s.expiresAt,
      lastActivityAt: s.lastActivityAt,
      createdAt: s.createdAt,
      isCurrent: req.session?._id === s._id.toString(),
    }));

    return res.status(200).json({ sessions: sanitized, total: sanitized.length });
  } catch (err) {
    logger.error("List sessions error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list sessions" });
  }
});

// DELETE / — revoke ALL sessions except current
router.delete("/", async (req, res) => {
  try {
    const userId = req.user!._id!.toString();
    const currentSessionId = req.session?._id;

    const count = await revokeAllSessionsForUser(userId, currentSessionId);

    return res.status(200).json({ revoked: count });
  } catch (err) {
    logger.error("Revoke all sessions error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to revoke sessions" });
  }
});

// DELETE /:id — revoke a specific session (only own sessions)
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user!._id!.toString();
    const sessionId = req.params.id;

    // Verify the session belongs to this user
    const session = await SessionModel.findOne({ _id: sessionId, userId });
    if (!session) {
      return res.status(404).json({ error: "SESSION_NOT_FOUND", message: "Session not found" });
    }

    await revokeSession(sessionId, "USER_REVOKED");

    return res.status(200).json({ revoked: true });
  } catch (err) {
    logger.error("Revoke session error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to revoke session" });
  }
});

export default router;
