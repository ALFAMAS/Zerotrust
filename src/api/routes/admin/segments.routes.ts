import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, getReadDb } from "../../../db";
import { usersTable } from "../../../db/schema";
import { countRows } from "../../../shared/dbCount";
import { internalError } from "../../../shared/httpErrors";
import { paginated, parsePaginatedQuery } from "../../../shared/pagination";
import type { HonoEnv } from "../../../shared/types";
import { logger } from "./_shared";

const router = new Hono<HonoEnv>();
// ── Customer segments ──────────────────────────────────────────────────────────
// Admin endpoints for tagging accounts with customer segments.

const VALID_SEGMENTS = ["champion", "at_risk", "expansion", "new"] as const;

// GET /admin/users/segments?segment=&page=&limit= — list users by segment (or counts if no segment)
router.get("/users/segments", async (c) => {
  try {
    const segment = c.req.query("segment");
    const db = getReadDb();

    if (segment && VALID_SEGMENTS.includes(segment as (typeof VALID_SEGMENTS)[number])) {
      const { page, limit, offset } = parsePaginatedQuery(c.req.query);
      const where = eq(usersTable.customerSegment, segment);
      const [rows, total] = await Promise.all([
        db
          .select({
            id: usersTable.id,
            email: usersTable.email,
            displayName: usersTable.displayName,
            customerSegment: usersTable.customerSegment,
          })
          .from(usersTable)
          .where(where)
          .orderBy(desc(usersTable.createdAt))
          .offset(offset)
          .limit(limit),
        countRows(db, usersTable, where),
      ]);
      return c.json(paginated(rows, { page, limit, total }));
    }

    // No segment specified — return bounded counts per segment
    const rows = await db
      .select({
        segment: usersTable.customerSegment,
        count: sql<number>`count(*)::int`,
      })
      .from(usersTable)
      .where(sql`${usersTable.customerSegment} IS NOT NULL`)
      .groupBy(usersTable.customerSegment);
    return c.json({ segments: rows });
  } catch (err) {
    return internalError(c, logger, "Admin segments error", err);
  }
});

// PUT /admin/users/:id/segment — set customer segment for a user
router.put("/users/:id/segment", async (c) => {
  try {
    const userId = c.req.param("id");
    const { segment } = await c.req.json().catch(() => ({ segment: null }));

    if (segment !== null && !VALID_SEGMENTS.includes(segment)) {
      return c.json(
        {
          error: "INVALID_REQUEST",
          message: `Segment must be one of: ${VALID_SEGMENTS.join(", ")}`,
        },
        400
      );
    }

    const db = getDb();
    const [updated] = await db
      .update(usersTable)
      .set({ customerSegment: segment, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, customerSegment: usersTable.customerSegment });

    if (!updated) {
      return c.json({ error: "USER_NOT_FOUND" }, 404);
    }

    return c.json({ user: updated });
  } catch (err) {
    return internalError(c, logger, "Admin set segment error", err);
  }
});

// ── Lifecycle emails ──────────────────────────────────────────────────────────

// POST /admin/lifecycle-emails — trigger lifecycle email batch (admin only)
router.post("/lifecycle-emails", async (c) => {
  try {
    const { sendLifecycleEmails } = await import(
      "../../../services/notifications/lifecycleEmail.service.js"
    );
    const results = await sendLifecycleEmails();
    return c.json({ success: true, results });
  } catch (err) {
    return internalError(c, logger, "Admin lifecycle emails error", err);
  }
});

export default router;
