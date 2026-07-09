import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, getReadDb } from "../../../db";
import { sessionsTable, usersTable } from "../../../db/schema";
import { revokeSession } from "../../../middleware/sessionControl";
import { countRows } from "../../../shared/dbCount";
import { internalError } from "../../../shared/httpErrors";
import { paginated } from "../../../shared/pagination";
import type { HonoEnv } from "../../../shared/types";
import { logger } from "./_shared";

const router = new Hono<HonoEnv>();
// GET /sessions?userId=&active=true&page=1&limit=20
router.get("/sessions", async (c) => {
  try {
    const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));

    const db = getReadDb();
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

export default router;
