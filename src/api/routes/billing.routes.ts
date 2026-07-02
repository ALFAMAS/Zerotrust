import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../../db";
import {
  reactivateSubscription,
  scheduleSubscriptionCancellation,
  setSubscriptionPaused,
} from "../../db/repositories/billingSubscriptions.repository";
import { feedbackTable, organizationMembersTable, subscriptionsTable } from "../../db/schema";
import { auditLog, getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { getStripe } from "../../services/billing/stripeWebhookProcessor";
import { getUsageSummary } from "../../services/billing/usage.service";
import { internalError } from "../../shared/httpErrors";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("billing-routes");

/** Trial length for new subscriptions; 0 disables trials. */
function trialDays(): number {
  return parseInt(process.env.TRIAL_DAYS ?? "14", 10);
}

/** Org-scoped requests require the caller to be an org owner or admin. */
async function canManageOrgBilling(orgId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const [member] = await db
    .select({ role: organizationMembersTable.role })
    .from(organizationMembersTable)
    .where(
      and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
    )
    .limit(1);
  return member?.role === "owner" || member?.role === "admin";
}

async function findSubscription(opts: { userId?: string; orgId?: string }) {
  const db = getDb();
  const where = opts.orgId
    ? eq(subscriptionsTable.orgId, opts.orgId)
    : eq(subscriptionsTable.userId, opts.userId!);
  const [sub] = await db.select().from(subscriptionsTable).where(where).limit(1);
  return sub;
}

// GET /billing/subscription?orgId= — user subscription, or the org's when orgId given
router.get("/subscription", authMiddleware, async (c) => {
  const user = c.get("user");
  const orgId = c.req.query("orgId");

  if (orgId && !(await canManageOrgBilling(orgId, user.id))) {
    return c.json({ error: "FORBIDDEN", message: "Org owner or admin required" }, 403);
  }

  const sub = await findSubscription({ userId: user.id, orgId });
  if (!sub) return c.json({ plan: "free", status: "active" });
  return c.json(sub);
});

// GET /billing/usage?orgId= — usage counters vs plan limits
router.get("/usage", authMiddleware, async (c) => {
  const user = c.get("user");
  const orgId = c.req.query("orgId");

  if (orgId && !(await canManageOrgBilling(orgId, user.id))) {
    return c.json({ error: "FORBIDDEN", message: "Org owner or admin required" }, 403);
  }

  const summary = await getUsageSummary(orgId ? { orgId } : { userId: user.id });
  return c.json(summary);
});

// POST /billing/checkout — body: { priceId, orgId? }
// With orgId the subscription belongs to the organization (per-org billing).
router.post("/checkout", authMiddleware, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const priceId = body.priceId as string;
  const orgId = body.orgId as string | undefined;
  if (!priceId) return c.json({ error: "INVALID_REQUEST" }, 400);

  if (orgId && !(await canManageOrgBilling(orgId, user.id))) {
    return c.json({ error: "FORBIDDEN", message: "Org owner or admin required" }, 403);
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";

  try {
    const stripe = getStripe();
    const sub = await findSubscription({ userId: user.id, orgId });

    let customerId = sub?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.displayName,
        metadata: orgId ? { orgId } : { userId: user.id },
      });
      customerId = customer.id;
    }

    // 14-day trial for first-time subscribers only (no previous subscription)
    const eligibleForTrial = trialDays() > 0 && !sub?.stripeSubscriptionId;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      ...(eligibleForTrial && {
        subscription_data: { trial_period_days: trialDays() },
      }),
      success_url: `${appUrl}/dashboard/billing?success=1`,
      cancel_url: `${appUrl}/dashboard/billing?canceled=1`,
      metadata: { userId: user.id, ...(orgId && { orgId }) },
    });

    return c.json({ url: session.url });
  } catch (err) {
    return internalError(c, logger, "Checkout session error", err);
  }
});

// POST /billing/change-plan — body: { priceId, orgId?, when?: "now" | "period_end" }
// Upgrades prorate immediately by default; downgrades can defer to period end.
router.post("/change-plan", authMiddleware, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const priceId = body.priceId as string;
  const orgId = body.orgId as string | undefined;
  const when = (body.when as string) === "period_end" ? "period_end" : "now";
  if (!priceId) return c.json({ error: "INVALID_REQUEST", message: "priceId required" }, 400);

  if (orgId && !(await canManageOrgBilling(orgId, user.id))) {
    return c.json({ error: "FORBIDDEN", message: "Org owner or admin required" }, 403);
  }

  try {
    const sub = await findSubscription({ userId: user.id, orgId });
    if (!sub?.stripeSubscriptionId) {
      return c.json({ error: "NO_SUBSCRIPTION", message: "No active subscription" }, 404);
    }

    const stripe = getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const itemId = stripeSub.items.data[0]?.id;
    if (!itemId) return c.json({ error: "NO_SUBSCRIPTION_ITEM" }, 500);

    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: when === "now" ? "create_prorations" : "none",
      ...(when === "period_end" && { billing_cycle_anchor: "unchanged" }),
    });

    await auditLog("billing.plan_changed", user.id, sub.id, true, { priceId, when });

    return c.json({
      success: true,
      status: updated.status,
      effective: when,
    });
  } catch (err) {
    return internalError(c, logger, "Plan change error", err);
  }
});

// POST /billing/cancel — body: { orgId?, reason?, comment?, action?: "cancel" | "pause" }
// Cancellation survey is stored as feedback; pause uses Stripe pause_collection.
router.post("/cancel", authMiddleware, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const orgId = body.orgId as string | undefined;
  const action = (body.action as string) === "pause" ? "pause" : "cancel";

  if (orgId && !(await canManageOrgBilling(orgId, user.id))) {
    return c.json({ error: "FORBIDDEN", message: "Org owner or admin required" }, 403);
  }

  try {
    const db = getDb();
    const sub = await findSubscription({ userId: user.id, orgId });
    if (!sub?.stripeSubscriptionId) {
      return c.json({ error: "NO_SUBSCRIPTION", message: "No active subscription" }, 404);
    }

    // Offboarding survey → feedback table (churn analytics)
    if (body.reason || body.comment) {
      await db.insert(feedbackTable).values({
        userId: user.id,
        orgId: orgId ?? null,
        type: "cancellation",
        comment: [body.reason, body.comment].filter(Boolean).join(" — "),
        context: "billing-cancel",
        metadata: { action, plan: sub.plan },
      });
    }

    const stripe = getStripe();

    if (action === "pause") {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        pause_collection: { behavior: "mark_uncollectible" },
      });
      await setSubscriptionPaused({ subscriptionId: sub.id, userId: user.id, reason: body.reason });
      await auditLog("billing.paused", user.id, sub.id, true, { reason: body.reason });
      return c.json({ success: true, action: "paused" });
    }

    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await scheduleSubscriptionCancellation({
      subscriptionId: sub.id,
      userId: user.id,
      reason: body.reason,
    });
    await auditLog("billing.cancel_scheduled", user.id, sub.id, true, { reason: body.reason });

    // Retention offer the UI can present after scheduling the cancel
    const winbackCoupon = process.env.STRIPE_WINBACK_COUPON;
    return c.json({
      success: true,
      action: "cancel_at_period_end",
      periodEnd: sub.currentPeriodEnd,
      ...(winbackCoupon && { offer: { type: "coupon", code: winbackCoupon } }),
    });
  } catch (err) {
    return internalError(c, logger, "Cancel error", err);
  }
});

// POST /billing/reactivate — undo a scheduled cancellation or resume a pause
router.post("/reactivate", authMiddleware, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const orgId = body.orgId as string | undefined;

  if (orgId && !(await canManageOrgBilling(orgId, user.id))) {
    return c.json({ error: "FORBIDDEN", message: "Org owner or admin required" }, 403);
  }

  try {
    const sub = await findSubscription({ userId: user.id, orgId });
    if (!sub?.stripeSubscriptionId) {
      return c.json({ error: "NO_SUBSCRIPTION" }, 404);
    }

    const stripe = getStripe();
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: false,
      pause_collection: null,
    });
    await reactivateSubscription({ subscriptionId: sub.id });
    await auditLog("billing.reactivated", user.id, sub.id, true);

    return c.json({ success: true });
  } catch (err) {
    return internalError(c, logger, "Reactivate error", err);
  }
});

// POST /billing/portal
router.post("/portal", authMiddleware, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const orgId = body.orgId as string | undefined;
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  if (orgId && !(await canManageOrgBilling(orgId, user.id))) {
    return c.json({ error: "FORBIDDEN", message: "Org owner or admin required" }, 403);
  }

  try {
    const stripe = getStripe();
    const sub = await findSubscription({ userId: user.id, orgId });

    if (!sub?.stripeCustomerId) {
      return c.json({ error: "NO_SUBSCRIPTION" }, 404);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl}/dashboard/billing`,
    });

    return c.json({ url: session.url });
  } catch (err) {
    return internalError(c, logger, "Portal session error", err);
  }
});

export default router;
