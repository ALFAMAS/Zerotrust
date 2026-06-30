import { Hono } from "hono";
import { z } from "zod";
import {
  claimProcessedWebhookEvent,
  releaseProcessedWebhookEvent,
} from "../../db/repositories/processedWebhookEvents.repository";
import { getLogger } from "../../logger";
import { suppressEmail } from "../../services/emailSuppression.service";
import { sha256Hex } from "../../shared/cryptoHash";
import { internalError } from "../../shared/httpErrors";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("email-events");

const eventSchema = z.object({
  eventId: z.string().trim().min(1).max(200).optional(),
  email: z.string().email(),
  type: z.enum(["bounce", "complaint"]),
  detail: z.string().max(500).optional(),
});

type EmailEvent = z.infer<typeof eventSchema>;

function emailEventKey(event: EmailEvent): string {
  if (event.eventId) return event.eventId;

  return `sha256:${sha256Hex(
    JSON.stringify({
      email: event.email.toLowerCase(),
      type: event.type,
      detail: event.detail ?? null,
    })
  )}`;
}

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

  const eventKey = emailEventKey(parsed.data);
  let claimed = false;

  try {
    claimed = await claimProcessedWebhookEvent({
      consumer: "email",
      eventKey,
      eventType: parsed.data.type,
    });
    if (!claimed) {
      logger.info("Duplicate email event skipped", {
        type: parsed.data.type,
        email: parsed.data.email,
      });
      return c.json({ suppressed: true, duplicate: true });
    }

    await suppressEmail(parsed.data.email, parsed.data.type, parsed.data.detail);
    logger.info("Email event suppressed recipient", {
      type: parsed.data.type,
      email: parsed.data.email,
    });
    return c.json({ suppressed: true });
  } catch (err) {
    if (claimed) {
      await releaseProcessedWebhookEvent({ consumer: "email", eventKey }).catch((releaseErr) =>
        logger.error("Failed to release email event idempotency claim", releaseErr)
      );
    }
    return internalError(c, logger, "Failed to process email event", err);
  }
});

export default router;
