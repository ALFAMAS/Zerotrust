/**
 * Stripe Billing Meters — record metered usage for invoice line items.
 * Fire-and-forget from API key middleware; explicit POST /billing/usage-events.
 */

import { eq } from "drizzle-orm";
import { getReadDb } from "../../db";
import { subscriptionsTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { getStripe } from "./stripeWebhookProcessor";

const logger = getLogger("stripe-meter");

export interface UsageEventInput {
  orgId?: string;
  userId?: string;
  metric: string;
  quantity?: number;
  timestamp?: number;
}

function meterEventName(metric: string): string {
  const map: Record<string, string> = {
    api_calls: process.env.STRIPE_METER_API_CALLS ?? "api_calls",
  };
  return map[metric] ?? metric;
}

export function isStripeMeterEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY) && process.env.STRIPE_METER_ENABLED === "true";
}

async function resolveStripeCustomerId(opts: {
  orgId?: string;
  userId?: string;
}): Promise<string | null> {
  const db = getReadDb();
  const where = opts.orgId
    ? eq(subscriptionsTable.orgId, opts.orgId)
    : opts.userId
      ? eq(subscriptionsTable.userId, opts.userId)
      : null;
  if (!where) return null;

  const [sub] = await db
    .select({ stripeCustomerId: subscriptionsTable.stripeCustomerId })
    .from(subscriptionsTable)
    .where(where)
    .limit(1);
  return sub?.stripeCustomerId ?? null;
}

/** Record a meter event in Stripe. Returns true when delivery was attempted. */
export async function recordStripeMeterEvent(input: UsageEventInput): Promise<boolean> {
  if (!isStripeMeterEnabled()) return false;

  const customerId = await resolveStripeCustomerId({
    orgId: input.orgId,
    userId: input.userId,
  });
  if (!customerId) return false;

  const eventName = meterEventName(input.metric);
  const value = input.quantity ?? 1;
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);

  try {
    const stripe = getStripe();
    await stripe.billing.meterEvents.create({
      event_name: eventName,
      payload: {
        stripe_customer_id: customerId,
        value: String(value),
      },
      timestamp,
    });
    return true;
  } catch (err) {
    logger.warn("Stripe meter event failed", {
      metric: input.metric,
      orgId: input.orgId,
      userId: input.userId,
      error: String(err),
    });
    return false;
  }
}
