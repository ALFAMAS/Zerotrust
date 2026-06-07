import { Hono } from "hono";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { getDb } from "../../db";
import { subscriptionsTable } from "../../db/schema";
import { getLogger } from "../../logger";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("billing-webhooks");

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

  let event: any;
  try {
    const stripe = getStripe();
    const rawBody = await c.req.raw.arrayBuffer();
    event = stripe.webhooks.constructEvent(Buffer.from(rawBody), sig, webhookSecret);
  } catch (err) {
    logger.error("Webhook signature verification failed", err as Error);
    return c.json({ error: "INVALID_SIGNATURE" }, 400);
  }

  const db = getDb();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        if (session.mode !== "subscription") break;
        const userId: string = session.metadata?.userId;
        if (!userId) break;
        const sub = (await getStripe().subscriptions.retrieve(
          session.subscription as string
        )) as any;
        const item = sub.items.data[0];

        await db
          .insert(subscriptionsTable)
          .values({
            userId,
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
          })
          .onConflictDoUpdate({
            target: subscriptionsTable.userId,
            set: {
              stripeSubscriptionId: sub.id,
              stripePriceId: item?.price?.id ?? null,
              stripeProductId: item?.price?.product ?? null,
              plan: planFromProductId(item?.price?.product ?? null),
              status: sub.status,
              currentPeriodStart: new Date(sub.current_period_start * 1000),
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              updatedAt: new Date(),
            },
          });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as any;
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
            updatedAt: new Date(),
          })
          .where(eq(subscriptionsTable.stripeSubscriptionId, sub.id));
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        await db
          .update(subscriptionsTable)
          .set({ status: "past_due", updatedAt: new Date() })
          .where(eq(subscriptionsTable.stripeSubscriptionId, invoice.subscription));
        break;
      }

      default:
        logger.info("Unhandled Stripe event", { type: event.type });
    }
  } catch (err) {
    logger.error("Webhook processing error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }

  return c.json({ received: true });
});

export default router;
