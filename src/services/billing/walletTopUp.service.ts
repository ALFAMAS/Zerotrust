import { eq } from "drizzle-orm";
import { getDb } from "../../db/index";
import { subscriptionsTable, walletsTable } from "../../db/schema";
import { getLogger } from "../../logger/index";
import { getStripe } from "./stripeWebhookProcessor";
import { getWallet } from "./wallet.service";

const logger = getLogger("wallet-topup");

/** Stripe PaymentIntent / Checkout metadata marker for wallet credits. */
export const WALLET_TOP_UP_METADATA_PURPOSE = "wallet_top_up";

/** Maximum single top-up: $10,000 USD (or equivalent in wallet currency). */
const MAX_TOP_UP_CENTS = 1_000_000;

export async function ensureWalletStripeCustomer(
  userId: string,
  email: string,
  displayName: string
): Promise<string> {
  const db = getDb();
  const [wallet] = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.userId, userId))
    .limit(1);

  if (wallet?.stripeCustomerId) return wallet.stripeCustomerId;

  const [sub] = await db
    .select({ stripeCustomerId: subscriptionsTable.stripeCustomerId })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .limit(1);

  const stripe = getStripe();
  let customerId = sub?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      name: displayName,
      metadata: { userId },
    });
    customerId = customer.id;
  }

  if (!wallet) {
    await db.insert(walletsTable).values({ userId, stripeCustomerId: customerId });
  } else {
    await db
      .update(walletsTable)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(walletsTable.userId, userId));
  }

  return customerId;
}

/**
 * Start a Stripe Checkout (payment mode) for a wallet top-up. Balance is credited
 * only after `payment_intent.succeeded` is processed by the billing webhook.
 */
export async function createWalletTopUpCheckout(opts: {
  userId: string;
  email: string;
  displayName: string;
  amountCents: number;
}): Promise<{ url: string; sessionId: string }> {
  const { userId, email, displayName, amountCents } = opts;
  if (amountCents <= 0) throw new Error("Top-up amount must be positive");
  if (amountCents > MAX_TOP_UP_CENTS) {
    throw new Error(`Top-up cannot exceed ${MAX_TOP_UP_CENTS / 100} dollars`);
  }

  const wallet = await getWallet(userId);
  const currency = (wallet.currency ?? "usd").toLowerCase();
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  const customerId = await ensureWalletStripeCustomer(userId, email, displayName);
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: { name: "Wallet credit top-up" },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      metadata: {
        userId,
        purpose: WALLET_TOP_UP_METADATA_PURPOSE,
      },
    },
    metadata: {
      userId,
      purpose: WALLET_TOP_UP_METADATA_PURPOSE,
      amountCents: String(amountCents),
    },
    success_url: `${appUrl}/dashboard/wallet?success=1`,
    cancel_url: `${appUrl}/dashboard/wallet?canceled=1`,
  });

  if (!session.url) throw new Error("Failed to create checkout session");

  logger.info("Wallet top-up checkout created", {
    userId,
    amountCents,
    sessionId: session.id,
  });

  return { url: session.url, sessionId: session.id };
}
