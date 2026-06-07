import { Hono } from "hono";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { getDb } from "../../db";
import { subscriptionsTable } from "../../db/schema";
import { authMiddleware } from "../../middleware/auth";
import { getLogger } from "../../logger";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("billing-routes");

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2024-04-10" as any });
}

// GET /billing/subscription
router.get("/subscription", authMiddleware, async (c) => {
  const user = c.get("user");
  const db = getDb();

  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, user.id))
    .limit(1);

  if (!sub) return c.json({ plan: "free", status: "active" });
  return c.json(sub);
});

// POST /billing/checkout
router.post("/checkout", authMiddleware, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const priceId = body.priceId as string;
  if (!priceId) return c.json({ error: "INVALID_REQUEST" }, 400);

  const appUrl = process.env.APP_URL || "http://localhost:3001";

  try {
    const stripe = getStripe();
    const db = getDb();

    // Find or create Stripe customer
    const [sub] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, user.id))
      .limit(1);

    let customerId = sub?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.displayName,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${appUrl}/dashboard/billing?success=1`,
      cancel_url: `${appUrl}/dashboard/billing?canceled=1`,
      metadata: { userId: user.id },
    });

    return c.json({ url: session.url });
  } catch (err) {
    logger.error("Checkout session error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// POST /billing/portal
router.post("/portal", authMiddleware, async (c) => {
  const user = c.get("user");
  const appUrl = process.env.APP_URL || "http://localhost:3001";

  try {
    const stripe = getStripe();
    const db = getDb();

    const [sub] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, user.id))
      .limit(1);

    if (!sub?.stripeCustomerId) {
      return c.json({ error: "NO_SUBSCRIPTION" }, 404);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl}/dashboard/billing`,
    });

    return c.json({ url: session.url });
  } catch (err) {
    logger.error("Portal session error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

export default router;
