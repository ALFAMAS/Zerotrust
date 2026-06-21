import { Hono } from "hono";
// drizzle imports added when extending this route
import { z } from "zod";
import { getDb } from "../../db";
import { feedbackTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rateLimiting";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("feedback-routes");

const submitSchema = z.object({
  type: z.enum(["nps", "csat", "thumbs"]),
  score: z.number().int().min(-1).max(10),
  comment: z.string().max(1000).optional(),
  context: z.string().max(100).optional(),
  orgId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// POST /feedback
router.post("/", authMiddleware, rateLimit({ points: 10, windowSecs: 3600 }), async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  try {
    const db = getDb();
    const [entry] = await db
      .insert(feedbackTable)
      .values({
        userId: user.id,
        orgId: parsed.data.orgId ?? null,
        type: parsed.data.type,
        score: parsed.data.score,
        comment: parsed.data.comment ?? null,
        context: parsed.data.context ?? null,
        metadata: parsed.data.metadata ?? null,
      })
      .returning();

    logger.info("Feedback submitted", { userId: user.id, type: parsed.data.type });
    return c.json(entry, 201);
  } catch (err) {
    logger.error("Submit feedback error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

export default router;
