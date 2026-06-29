import { Hono } from "hono";
import { z } from "zod";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import {
  countPointsHistory,
  countWalletTransactions,
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
import { internalError } from "../../shared/httpErrors";
import { paginated, parsePaginatedQuery } from "../../shared/pagination";
import { appRedirectUrl } from "../../shared/safeRedirect";
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
    return internalError(c, logger, "Get points balance error", err);
  }
});

// GET /points/history — points history
router.get("/points/history", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const { page, limit, offset } = parsePaginatedQuery(c.req.query(), {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const [history, total] = await Promise.all([
      getPointsHistory(user.id, limit, offset),
      countPointsHistory(user.id),
    ]);
    return c.json(paginated(history, { page, limit, total }));
  } catch (err) {
    return internalError(c, logger, "Get points history error", err);
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
    return internalError(c, logger, "Get tier error", err);
  }
});

// ── Redemptions ───────────────────────────────────────────────────────────────

// GET /redemptions/catalog — available redemption items
router.get("/redemptions/catalog", async (c) => {
  try {
    const items = await getRedemptionCatalog();
    return c.json({ items });
  } catch (err) {
    return internalError(c, logger, "Get redemption catalog error", err);
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

// GET /referrals/resolve?slug=xxx — public slug → code resolution (used by /r/[slug] page)
router.get("/referrals/resolve", async (c) => {
  try {
    const slug = c.req.query("slug");
    if (!slug) return c.json({ error: "MISSING_SLUG" }, 400);
    const ref = await getReferralBySlug(slug);
    if (!ref) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json({ code: ref.code, slug: ref.slug });
  } catch (err) {
    return internalError(c, logger, "Resolve referral error", err);
  }
});

const referralSchema = z.object({ slug: z.string().min(3).max(50).optional() });

// POST /referrals — create a referral link
router.post("/referrals", async (c) => {
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
    return internalError(c, logger, "Create referral error", err);
  }
});

// GET /referrals/dashboard — referral dashboard stats
router.get("/referrals/dashboard", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const dashboard = await getReferralDashboard(user.id);
    return c.json(dashboard);
  } catch (err) {
    return internalError(c, logger, "Referral dashboard error", err);
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
    return c.redirect(appRedirectUrl(`/register?ref=${encodeURIComponent(ref.code)}`));
  } catch (err) {
    logger.error("Referral click error", err as Error);
    return c.redirect("/register");
  }
});

export default router;
