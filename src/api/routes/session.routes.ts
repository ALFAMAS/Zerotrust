import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../../db";
import { sessionsTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { paginated, parsePaginatedQuery } from "../../shared/pagination";
import { revokeAllSessionsForUser, revokeSession } from "../../middleware/sessionControl";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("session-routes");

router.use("*", authMiddleware);

// GET / — list user's own sessions
router.get("/", async (c) => {
  try {
    const userId = c.get("user").id;
    const currentSessionId = c.get("session")?.id;
    const { page, limit, offset } = parsePaginatedQuery(c.req.query());
    const db = getDb();
    const where = eq(sessionsTable.userId, userId);
    const [sessions, countResult] = await Promise.all([
      db
        .select()
        .from(sessionsTable)
        .where(where)
        .orderBy(desc(sessionsTable.lastActivityAt))
        .offset(offset)
        .limit(limit),
      db.select({ count: sql<number>`count(*)::int` }).from(sessionsTable).where(where),
    ]);

    const sanitized = sessions.map((s) => ({
      id: s.id,
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
      isCurrent: currentSessionId === s.id,
    }));

    return c.json(paginated(sanitized, { page, limit, total: countResult[0]?.count ?? 0 }));
  } catch (err) {
    logger.error("List sessions error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to list sessions" }, 500);
  }
});

// DELETE / — revoke ALL sessions except current
router.delete("/", async (c) => {
  try {
    const userId = c.get("user").id;
    const currentSessionId = c.get("session")?.id;
    const count = await revokeAllSessionsForUser(userId, currentSessionId);
    return c.json({ revoked: count });
  } catch (err) {
    logger.error("Revoke all sessions error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to revoke sessions" }, 500);
  }
});

// DELETE /:id — revoke a specific session (only own sessions)
router.delete("/:id", async (c) => {
  try {
    const userId = c.get("user").id;
    const sessionId = c.req.param("id");
    const db = getDb();

    const rows = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.userId, userId)))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: "SESSION_NOT_FOUND", message: "Session not found" }, 404);
    }

    await revokeSession(sessionId, "USER_REVOKED");
    return c.json({ revoked: true });
  } catch (err) {
    logger.error("Revoke session error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to revoke session" }, 500);
  }
});

export default router;
