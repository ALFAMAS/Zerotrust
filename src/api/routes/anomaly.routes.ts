import { desc } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { getDb } from "../../db/index.js";
import { userBehaviorBaselinesTable } from "../../db/schema.js";
import { getLogger } from "../../logger/index.js";
import { authMiddleware } from "../../middleware/auth.js";
import {
  getBaseline,
  resetBaseline,
  scoreAnomaly,
} from "../../services/anomalyDetection.service.js";
import { countRows } from "../../shared/dbCount.js";
import { paginated, parsePaginatedQuery } from "../../shared/pagination.js";
import { hasRole } from "../../shared/roles.js";
import type { HonoEnv } from "../../shared/types.js";

const router = new Hono<HonoEnv>();
const logger = getLogger("anomaly-routes");

function isAdmin(c: Context<HonoEnv>): boolean {
  return hasRole(c.get("user"), "admin");
}

router.use("*", authMiddleware);

// GET /admin/anomaly/baselines
router.get("/baselines", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "FORBIDDEN" }, 403);
  try {
    const { page, limit, offset } = parsePaginatedQuery(c.req.query());
    const db = getDb();
    const [rows, total] = await Promise.all([
      db
        .select()
        .from(userBehaviorBaselinesTable)
        .orderBy(desc(userBehaviorBaselinesTable.userId))
        .offset(offset)
        .limit(limit),
      countRows(db, userBehaviorBaselinesTable),
    ]);
    return c.json(paginated(rows, { page, limit, total }));
  } catch (err) {
    logger.warn("Failed to list baselines", { error: String(err) });
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /admin/anomaly/baseline/:userId
router.get("/baseline/:userId", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "FORBIDDEN" }, 403);
  try {
    const baseline = await getBaseline(c.req.param("userId"));
    if (!baseline) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json(baseline);
  } catch (err) {
    logger.warn("Failed to get baseline", { error: String(err) });
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// DELETE /admin/anomaly/baseline/:userId
router.delete("/baseline/:userId", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "FORBIDDEN" }, 403);
  try {
    await resetBaseline(c.req.param("userId"));
    return c.json({ success: true });
  } catch (err) {
    logger.warn("Failed to reset baseline", { error: String(err) });
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /admin/anomaly/score
router.post("/score", async (c) => {
  if (!isAdmin(c)) return c.json({ error: "FORBIDDEN" }, 403);
  try {
    const body = (await c.req.json()) as {
      userId: string;
      ip: string;
      country?: string | null;
      deviceHash: string;
      loginHour: number;
    };
    if (!body.userId || !body.ip || !body.deviceHash || body.loginHour === undefined) {
      return c.json(
        { error: "INVALID_REQUEST", message: "userId, ip, deviceHash, loginHour required" },
        400
      );
    }
    const signals = await scoreAnomaly({
      userId: body.userId,
      ip: body.ip,
      country: body.country ?? null,
      deviceHash: body.deviceHash,
      loginHour: body.loginHour,
    });
    return c.json(signals);
  } catch (err) {
    logger.warn("Anomaly score request failed", { error: String(err) });
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

export default router;
