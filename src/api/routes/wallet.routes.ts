import { Hono } from "hono";
import { z } from "zod";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import {
  countWalletTransactions,
  getWallet,
  getWalletTransactions,
  spendFromWallet,
  topUpWallet,
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
  stripePaymentIntentId: z.string().optional(),
});

// POST /wallet/top-up — add funds to wallet
router.post("/top-up", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const parsed = topUpSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const result = await topUpWallet(user.id, parsed.data.amount, {
      stripePaymentIntentId: parsed.data.stripePaymentIntentId,
    });
    return c.json(result);
  } catch (err: any) {
    logger.error("Top-up error", err as Error);
    return c.json({ error: "INVALID_REQUEST", message: err.message }, 400);
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
