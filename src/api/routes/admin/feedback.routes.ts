import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getReadDb } from "../../../db";
import { feedbackTable } from "../../../db/schema";
import { countRows } from "../../../shared/dbCount";
import { internalError } from "../../../shared/httpErrors";
import { paginated, parsePaginatedQuery } from "../../../shared/pagination";
import type { HonoEnv } from "../../../shared/types";
import { logger } from "./_shared";

const router = new Hono<HonoEnv>();
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

export default router;
