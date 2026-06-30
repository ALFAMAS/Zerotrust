import { eq } from "drizzle-orm";
import { Hono } from "hono";
import Stripe from "stripe";
import { getDb } from "../../db";
import {
  claimStripeEvent,
  releaseStripeEvent,
} from "../../db/repositories/stripeEvents.repository";
import { subscriptionsTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { internalError } from "../../shared/httpErrors";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("billing-webhooks");

// Minimal shapes for the exact fields we read from the 2024-04-10 webhook
// payloads. We model these explicitly instead of using the SDK's `Stripe.*`
// types because the installed SDK is pinned to a newer apiVersion whose types
// have relocated some of these fields (e.g. `current_period_*` moved off
// `Subscription`). This removes the broad `as any` while staying truthful to
// the JSON we actually receive.
interface StripeSubscriptionPayload {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_start: number;
  current_period_end: number;
  trial_end: number | null;
  items: { data: Array<{ price?: { id?: string | null; product?: string | null } | null }> };
}
interface StripeCheckoutSessionPayload {
  mode: string | null;
  customer: string | null;
  subscription: string | null;
  metadata: { userId?: string; orgId?: string } | null;
}
interface StripeInvoicePayload {
  subscription: string | null;
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2024-04-10" as any });
}

function planFromProductId(productId: string | null): string {
  if (!productId) return "free";
  const map: Record<string, string> = {
    [process.env.STRIPE_PRODUCT_PRO ?? ""]: "pro",
    [process.env.STRIPE_PRODUCT_ENTERPRISE ?? ""]: "enterprise",
  };
  return map[productId] ?? "pro";
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

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const rawBody = await c.req.raw.arrayBuffer();
    event = stripe.webhooks.constructEvent(Buffer.from(rawBody), sig, webhookSecret);
  } catch (err) {
    logger.error("Webhook signature verification failed", err as Error);
    return c.json({ error: "INVALID_SIGNATURE" }, 400);
  }

  const db = getDb();

  // Idempotency: claim this event id before applying it. Stripe delivers
  // at-least-once, so a redelivered or replayed event must be a no-op.
  const claimed = await claimStripeEvent(event.id, event.type);
  if (!claimed) {
    logger.info("Duplicate Stripe event ignored", { eventId: event.id, type: event.type });
    return c.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as unknown as StripeCheckoutSessionPayload;
        if (session.mode !== "subscription") break;
        const userId: string | undefined = session.metadata?.userId;
        const orgId: string | undefined = session.metadata?.orgId;
        if (!userId && !orgId) break;
        const sub = (await getStripe().subscriptions.retrieve(
          session.subscription as string
        )) as unknown as StripeSubscriptionPayload;
        const item = sub.items.data[0];

        const values = {
          // Per-org subscriptions belong to the org; personal ones to the user
          userId: orgId ? null : (userId ?? null),
          orgId: orgId ?? null,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: sub.id,
          stripePriceId: item?.price?.id ?? null,
          stripeProductId: item?.price?.product ?? null,
          plan: planFromProductId(item?.price?.product ?? null),
          status: sub.status,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
        };

        await db
          .insert(subscriptionsTable)
          .values(values)
          .onConflictDoUpdate({
            target: orgId ? subscriptionsTable.orgId : subscriptionsTable.userId,
            set: { ...values, updatedAt: new Date() },
          });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as unknown as StripeSubscriptionPayload;
        const item = sub.items.data[0];
        const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;

        await db
          .update(subscriptionsTable)
          .set({
            stripePriceId: item?.price?.id ?? null,
            stripeProductId: item?.price?.product ?? null,
            plan: status === "canceled" ? "free" : planFromProductId(item?.price?.product ?? null),
            status,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
            // canceledAt drives the win-back email sequence (D7/D30/D90)
            ...(status === "canceled" && { canceledAt: new Date() }),
            updatedAt: new Date(),
          })
          .where(eq(subscriptionsTable.stripeSubscriptionId, sub.id));
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as unknown as StripeInvoicePayload;
        if (!invoice.subscription) break;
        const [existing] = await db
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.stripeSubscriptionId, invoice.subscription))
          .limit(1);
        if (!existing) break;

        // Stamp dunningStartedAt (only on the first failure of a sequence)
        // so the lifecycle scheduler can send D3/D7/D14 reminders.
        const meta = (existing.metadata as Record<string, unknown>) ?? {};
        if (existing.status !== "past_due" || !meta.dunningStartedAt) {
          meta.dunningStartedAt = new Date().toISOString();
          meta.dunningStagesSent = [];
        }

        await db
          .update(subscriptionsTable)
          .set({ status: "past_due", metadata: meta, updatedAt: new Date() })
          .where(eq(subscriptionsTable.id, existing.id));
        break;
      }

      case "invoice.payment_succeeded": {
        // Recovered payment clears the dunning sequence
        const invoice = event.data.object as unknown as StripeInvoicePayload;
        if (!invoice.subscription) break;
        const [existing] = await db
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.stripeSubscriptionId, invoice.subscription))
          .limit(1);
        if (existing?.status !== "past_due") break;

        const meta = (existing.metadata as Record<string, unknown>) ?? {};
        delete meta.dunningStartedAt;
        delete meta.dunningStagesSent;

        await db
          .update(subscriptionsTable)
          .set({ status: "active", metadata: meta, updatedAt: new Date() })
          .where(eq(subscriptionsTable.id, existing.id));
        break;
      }

      default:
        logger.info("Unhandled Stripe event", { type: event.type });
    }
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
