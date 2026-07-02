/**
 * Stripe webhook event processing — the subscription-lifecycle mutations for
 * each event type. Extracted from the webhook route (billing.webhooks.ts) so
 * the exact same logic runs whether the event is processed synchronously in
 * the request path (no queue configured) or inside the BullMQ worker
 * (stripeWebhookQueue.ts) when Redis is available. See tdone.md P3.3.
 */
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { getDb } from "../../db/index";
import {
  applySubscriptionLifecycleUpdate,
  clearSubscriptionDunning,
  recordInvoicePaymentFailure,
  upsertCheckoutSubscription,
} from "../../db/repositories/billingSubscriptions.repository";
import { subscriptionsTable } from "../../db/schema";
import { getLogger } from "../../logger/index";

const logger = getLogger("stripe-webhook-processor");

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

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  // `apiVersion` deliberately pins an older, stable API version rather than
  // the one bundled with the installed SDK. The SDK only exposes its own
  // bundled version as a type-level literal (`LatestApiVersion`) and doesn't
  // publicly export a type for "any valid API version string", so pinning an
  // older version can't be expressed without a cast — this isn't a masked bug.
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

/**
 * Apply a single Stripe webhook event's mutation. Throws on failure — the
 * caller (route handler for the sync-fallback path, or the queue worker) is
 * responsible for releasing the event's idempotency claim so it can be
 * retried.
 */
export async function processStripeEvent(type: string, object: unknown): Promise<void> {
  const db = getDb();

  switch (type) {
    case "checkout.session.completed": {
      const session = object as StripeCheckoutSessionPayload;
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

      await upsertCheckoutSubscription(values);
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = object as StripeSubscriptionPayload;
      const item = sub.items.data[0];
      const status = type === "customer.subscription.deleted" ? "canceled" : sub.status;

      await applySubscriptionLifecycleUpdate({
        stripeSubscriptionId: sub.id,
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
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = object as StripeInvoicePayload;
      if (!invoice.subscription) break;
      const [existing] = await db
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.stripeSubscriptionId, invoice.subscription))
        .limit(1);
      if (!existing) break;

      await recordInvoicePaymentFailure({
        subscriptionId: existing.id,
        existingMetadata: (existing.metadata as Record<string, unknown>) ?? {},
        wasAlreadyPastDue: existing.status === "past_due",
      });
      break;
    }

    case "invoice.payment_succeeded": {
      // Recovered payment clears the dunning sequence
      const invoice = object as StripeInvoicePayload;
      if (!invoice.subscription) break;
      const [existing] = await db
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.stripeSubscriptionId, invoice.subscription))
        .limit(1);
      if (existing?.status !== "past_due") break;

      await clearSubscriptionDunning({ subscriptionId: existing.id });
      break;
    }

    default:
      logger.info("Unhandled Stripe event", { type });
  }
}
