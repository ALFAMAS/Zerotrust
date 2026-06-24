import { Hono } from "hono";
import { z } from "zod";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import {
  createReferralLink,
  getCurrentTier,
  getPointsBalance,
  getPointsHistory,
  getRedemptionCatalog,
  getReferralBySlug,
  getReferralDashboard,
  getWallet,
  getWalletTransactions,
  redeemItem,
  spendFromWallet,
  topUpWallet,
  trackReferralClick,
} from "../../services/wallet.service";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("wallet-routes");

// ── Auth guard ────────────────────────────────────────────────────────────────
router.use("*", authMiddleware);

// ── Wallet ────────────────────────────────────────────────────────────────────

// GET /wallet — get wallet balance + tier
router.get("/", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const wallet = await getWallet(user.id);
    return c.json(wallet);
  } catch (err) {
    logger.error("Get wallet error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /wallet/transactions — transaction history
router.get("/transactions", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const limit = Math.min(parseInt(c.req.query("limit") ?? "30", 10), 100);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);
    const txs = await getWalletTransactions(user.id, limit, offset);
    return c.json({ transactions: txs });
  } catch (err) {
    logger.error("Get wallet transactions error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
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

// ── Points ────────────────────────────────────────────────────────────────────

// GET /points/balance — get points balance
router.get("/points/balance", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const balance = await getPointsBalance(user.id);
    const tier = await getCurrentTier(user.id);
    return c.json({ ...balance, tier });
  } catch (err) {
    logger.error("Get points balance error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /points/history — points history
router.get("/points/history", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);
    const history = await getPointsHistory(user.id, limit, offset);
    return c.json({ history });
  } catch (err) {
    logger.error("Get points history error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Tier ──────────────────────────────────────────────────────────────────────

// GET /tier — get current tier
router.get("/tier", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const tier = await getCurrentTier(user.id);
    return c.json({ tier });
  } catch (err) {
    logger.error("Get tier error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Redemptions ───────────────────────────────────────────────────────────────

// GET /redemptions/catalog — available redemption items
router.get("/redemptions/catalog", async (c) => {
  try {
    const items = await getRedemptionCatalog();
    return c.json({ items });
  } catch (err) {
    logger.error("Get redemption catalog error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

const redeemSchema = z.object({ key: z.string().min(1) });

// POST /redemptions — redeem points for an item
router.post("/redemptions", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const parsed = redeemSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const result = await redeemItem(user.id, parsed.data.key);
    return c.json(result);
  } catch (err: any) {
    logger.error("Redemption error", err as Error);
    return c.json({ error: "INVALID_REQUEST", message: err.message }, 400);
  }
});

// ── Referrals ─────────────────────────────────────────────────────────────────

const referralSchema = z.object({ slug: z.string().min(3).max(50).optional() });

// POST /referrals — create a referral link
router.post("/", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const parsed = referralSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    const result = await createReferralLink(user.id, parsed.data.slug);
    return c.json(result, 201);
  } catch (err) {
    logger.error("Create referral error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// GET /referrals/dashboard — referral dashboard stats
router.get("/dashboard", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const dashboard = await getReferralDashboard(user.id);
    return c.json(dashboard);
  } catch (err) {
    logger.error("Referral dashboard error", err as Error);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
});

// ── Public: referral click tracking ──────────────────────────────────────────

// GET /r/:slug — track referral click and redirect
router.get("/r/:slug", async (c) => {
  try {
    const slug = c.req.param("slug");
    const ref = await getReferralBySlug(slug);
    if (!ref) return c.json({ error: "NOT_FOUND" }, 404);

    const ip = c.req.header("x-forwarded-for") ?? "unknown";
    const ua = c.req.header("user-agent") ?? "unknown";
    const utmSource = c.req.query("utm_source") ?? undefined;
    const utmMedium = c.req.query("utm_medium") ?? undefined;
    const utmCampaign = c.req.query("utm_campaign") ?? undefined;

    const trackingId = await trackReferralClick(
      ref.code,
      ip,
      ua,
      utmSource,
      utmMedium,
      utmCampaign
    );

    // Store tracking ID in cookie for later signup attribution
    c.header("Set-Cookie", `za_referral=${trackingId}; Path=/; Max-Age=2592000; SameSite=Lax`);
    const redirectUrl = process.env.APP_URL
      ? `${process.env.APP_URL}/register?ref=${ref.code}`
      : `/register?ref=${ref.code}`;
    return c.redirect(redirectUrl);
  } catch (err) {
    logger.error("Referral click error", err as Error);
    return c.redirect("/register");
  }
});

export default router;
