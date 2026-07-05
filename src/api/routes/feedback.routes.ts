import { Hono } from "hono";
// drizzle imports added when extending this route
import { z } from "zod";
import { getDb } from "../../db";
import { feedbackTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rateLimiting";
import { zValidator } from "../../middleware/zodValidation";
import { internalError } from "../../shared/httpErrors";
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
router.post(
  "/",
  authMiddleware,
  rateLimit({ points: 10, windowSecs: 3600 }),
  zValidator("json", submitSchema),
  async (c) => {
    const user = c.get("user");
    const parsed = c.req.valid("json");

    try {
      const db = getDb();
      const [entry] = await db
        .insert(feedbackTable)
        .values({
          userId: user.id,
          orgId: parsed.orgId ?? null,
          type: parsed.type,
          score: parsed.score,
          comment: parsed.comment ?? null,
          context: parsed.context ?? null,
          metadata: parsed.metadata ?? null,
        })
        .returning();

      logger.info("Feedback submitted", { userId: user.id, type: parsed.type });
      return c.json(entry, 201);
    } catch (err) {
      return internalError(c, logger, "Submit feedback error", err);
    }
  }
);

export default router;
