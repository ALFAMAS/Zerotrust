import { Hono } from "hono";
import { z } from "zod";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { createWalletTopUpCheckout } from "../../services/billing/walletTopUp.service";
import {
  countWalletTransactions,
  getWallet,
  getWalletTransactions,
  spendFromWallet,
} from "../../services/billing/wallet.service";
import { internalError } from "../../shared/httpErrors";
import { paginated, parsePaginatedQuery } from "../../shared/pagination";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("wallet-routes");

// ── Auth guard ────────────────────────────────────────────────────────────────
router.use("*", authMiddleware);

// ── Wallet ────────────────────────────────────────────────────────────────────

// GET /wallet — get wallet balance
router.get("/", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const wallet = await getWallet(user.id);
    return c.json(wallet);
  } catch (err) {
    return internalError(c, logger, "Get wallet error", err);
  }
});

// GET /wallet/transactions — transaction history
router.get("/transactions", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const { page, limit, offset } = parsePaginatedQuery(c.req.query(), {
      defaultLimit: 30,
      maxLimit: 100,
    });
    const [txs, total] = await Promise.all([
      getWalletTransactions(user.id, limit, offset),
      countWalletTransactions(user.id),
    ]);
    return c.json(paginated(txs, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "Get wallet transactions error", err);
  }
});

const topUpSchema = z.object({
  amount: z.number().int().positive(),
});

// POST /wallet/top-up — start Stripe Checkout for a wallet credit purchase.
// Balance is credited only after payment_intent.succeeded via the billing webhook.
router.post("/top-up", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const parsed = topUpSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

    try {
      const result = await createWalletTopUpCheckout({
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        amountCents: parsed.data.amount,
      });
      return c.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("STRIPE_SECRET_KEY")) {
        return c.json(
          { error: "BILLING_UNAVAILABLE", message: "Stripe billing is not configured" },
          503
        );
      }
      throw err;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Top-up failed";
    logger.error("Top-up checkout error", err instanceof Error ? err : new Error(message));
    return c.json({ error: "INVALID_REQUEST", message }, 400);
  }
});

// POST /wallet/spend — spend from wallet
const spendSchema = z.object({
  amount: z.number().int().positive(),
  description: z.string().max(200).optional(),
});

router.post("/spend", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const parsed = spendSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const result = await spendFromWallet(user.id, parsed.data.amount, {
      description: parsed.data.description,
    });
    return c.json(result);
  } catch (err: any) {
    logger.error("Spend error", err as Error);
    return c.json({ error: "INVALID_REQUEST", message: err.message }, 400);
  }
});

export default router;
