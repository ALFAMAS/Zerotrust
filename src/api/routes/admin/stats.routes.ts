import { eq, gt, ne } from "drizzle-orm";
import { Hono } from "hono";
import { getReadDb } from "../../../db";
import { sessionsTable, usersTable } from "../../../db/schema";
import { countRows } from "../../../shared/dbCount";
import { internalError } from "../../../shared/httpErrors";
import type { HonoEnv } from "../../../shared/types";
import { logger } from "./_shared";

const router = new Hono<HonoEnv>();
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


export default router;
