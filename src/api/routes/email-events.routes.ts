import { Hono } from "hono";
import { z } from "zod";
import { suppressEmail } from "../../services/emailSuppression.service";
import { getLogger } from "../../logger";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("email-events");

const eventSchema = z.object({
  email: z.string().email(),
  type: z.enum(["bounce", "complaint"]),
  detail: z.string().max(500).optional(),
});

/**
 * Provider-agnostic bounce/complaint webhook. Point your ESP (SES/SNS, Postmark,
 * Mailgun, …) at this endpoint — normalize its payload to `{ email, type }`.
 * Hard bounces and spam complaints add the address to the suppression list so we
 * stop emailing it, protecting sender reputation.
 *
 * Optionally protected by a shared secret: set EMAIL_WEBHOOK_SECRET and send it
 * in the `X-Webhook-Secret` header.
 */
router.post("/event", async (c) => {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (secret && c.req.header("x-webhook-secret") !== secret) {
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }

  const parsed = eventSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
  }

  try {
    await suppressEmail(parsed.data.email, parsed.data.type, parsed.data.detail);
    logger.info("Email event suppressed recipient", {
      type: parsed.data.type,
      email: parsed.data.email,
    });
    return c.json({ suppressed: true });
  } catch (err) {
    logger.error("Failed to process email event", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

export default router;
