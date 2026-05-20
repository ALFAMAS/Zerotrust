import express from "express";
import { authMiddleware } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rateLimiting";
import { validate } from "../../middleware/validation";
import { ListSessionsQuerySchema, RevokeSessionSchema } from "../schemas/session.schema";
import { SessionModel } from "../../models";
import { revokeSession, revokeAllSessionsForUser } from "../../middleware/sessionControl";
import { getLogger } from "../../logger";
import { ErrorCodes } from "../../shared/types";

const router = express.Router();
const logger = getLogger("session-routes");

router.get(
  "/",
  rateLimit({ points: 60, windowSecs: 60 }),
  authMiddleware,
  validate(ListSessionsQuerySchema, "query"),
  async (req, res) => {
    try {
      const { limit, offset, activeOnly } = req.query as any;
      const userId = req.user!._id!.toString();

      const filter: any = { userId };
      if (activeOnly) filter.isActive = true;

      const [sessions, total] = await Promise.all([
        SessionModel.find(filter)
          .sort({ lastActivityAt: -1 })
          .skip(offset)
          .limit(limit)
          .select("-__v")
          .lean(),
        SessionModel.countDocuments(filter),
      ]);

      const currentSessionId = req.session?._id;

      res.json({
        sessions: sessions.map((s) => ({
          id: s._id.toString(),
          deviceFingerprint: {
            platform: s.deviceFingerprint?.platform,
            browser: s.deviceFingerprint?.browser,
            os: s.deviceFingerprint?.os,
          },
          ipAddress: s.ipAddress,
          country: s.country,
          userAgent: s.userAgent,
          isActive: s.isActive,
          lastActivityAt: s.lastActivityAt,
          createdAt: s.createdAt,
          isCurrent: s._id.toString() === currentSessionId,
        })),
        total,
        limit,
        offset,
      });
    } catch (err) {
      logger.error("List sessions error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "Failed to list sessions", details: [] });
    }
  }
);

router.delete(
  "/:id",
  rateLimit({ points: 30, windowSecs: 60 }),
  authMiddleware,
  validate(RevokeSessionSchema),
  async (req, res) => {
    try {
      const userId = req.user!._id!.toString();
      const session = await SessionModel.findOne({ _id: req.params.id, userId });
      if (!session) {
        return res
          .status(404)
          .json({ code: ErrorCodes.SESSION_NOT_FOUND, message: "Session not found", details: [] });
      }

      const reason = (req.body as any)?.reason || "user_revoked";
      await revokeSession(req.params.id, reason);
      res.json({ success: true, sessionId: req.params.id });
    } catch (err) {
      logger.error("Revoke session error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to revoke session",
        details: [],
      });
    }
  }
);

router.delete("/", rateLimit({ points: 10, windowSecs: 60 }), authMiddleware, async (req, res) => {
  try {
    const userId = req.user!._id!.toString();
    const currentSessionId = req.session?._id;
    const count = await revokeAllSessionsForUser(userId, currentSessionId);
    res.json({ success: true, revokedCount: count });
  } catch (err) {
    logger.error("Revoke all sessions error", err as Error);
    res
      .status(500)
      .json({ code: ErrorCodes.INTERNAL_ERROR, message: "Failed to revoke sessions", details: [] });
  }
});

export default router;
