import { Hono } from "hono";
import {
  claimStripeEvent,
  releaseStripeEvent,
} from "../../db/repositories/stripeEvents.repository";
import { getLogger } from "../../logger";
import { getStripe, processStripeEvent } from "../../services/billing/stripeWebhookProcessor";
import { enqueueStripeWebhookEvent } from "../../services/billing/stripeWebhookQueue";
import { internalError } from "../../shared/httpErrors";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("billing-webhooks");

interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: unknown };
}

// POST /billing/webhook
router.post("/webhook", async (c) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("STRIPE_WEBHOOK_SECRET not configured");
    return c.json({ error: "MISCONFIGURED" }, 500);
  }

  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "MISSING_SIGNATURE" }, 400);

  let event: StripeWebhookEvent;
  try {
    const stripe = getStripe();
    const rawBody = await c.req.raw.arrayBuffer();
    event = (await stripe.webhooks.constructEventAsync(
      Buffer.from(rawBody),
      sig,
      webhookSecret
    )) as StripeWebhookEvent;
  } catch (err) {
    logger.error("Webhook signature verification failed", err as Error);
    return c.json({ error: "INVALID_SIGNATURE" }, 400);
  }

  // Idempotency: claim this event id before applying it. Stripe delivers
  // at-least-once, so a redelivered or replayed event must be a no-op.
  const claimed = await claimStripeEvent(event.id, event.type);
  if (!claimed) {
    logger.info("Duplicate Stripe event ignored", { eventId: event.id, type: event.type });
    return c.json({ received: true, duplicate: true });
  }

  // Prefer offloading the mutation (Stripe API retrieve + Postgres write) to
  // the BullMQ queue when Redis is configured, so this request returns a fast
  // ack and the API process isn't blocked on a Stripe round-trip. The worker
  // releases the claim on permanent failure (see stripeWebhookQueue.ts).
  const queued = await enqueueStripeWebhookEvent({
    eventId: event.id,
    type: event.type,
    object: event.data.object,
  });
  if (queued) {
    return c.json({ received: true, queued: true });
  }

  // No queue configured (dev, or REDIS_URI unset) — process synchronously so
  // the webhook is never silently dropped.
  try {
    await processStripeEvent(event.type, event.data.object);
  } catch (err) {
    // Processing failed after we claimed the event — release the claim so
    // Stripe's next retry reprocesses it instead of being skipped as a dupe.
    await releaseStripeEvent(event.id).catch((releaseErr) =>
      logger.error("Failed to release Stripe event claim after error", releaseErr as Error)
    );
    return internalError(c, logger, "Webhook processing error", err);
  }

  return c.json({ received: true });
});

export default router;
