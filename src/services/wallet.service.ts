import { and, desc, eq, sql } from "drizzle-orm";
import { generateCodeFromAlphabet } from "../crypto/codes";
import { getDb } from "../db";
import {
  spendFromWallet as spendFromWalletRepo,
  topUpWallet as topUpWalletRepo,
} from "../db/repositories/wallet.repository";
import {
  pointsLedgerTable,
  redemptionsCatalogTable,
  redemptionsTable,
  referralsTable,
  referralTrackingTable,
  tiersTable,
  usersTable,
  userTiersTable,
  walletsTable,
  walletTransactionsTable,
} from "../db/schema";
import { isUnavailableStorageError } from "../db/storageFallback";
import { getLogger } from "../logger";
import { countRows } from "../shared/dbCount";

const logger = getLogger("wallet-service");

const WALLET_COLUMNS = [
  "user_id",
  "balance",
  "lifetime_balance",
  "currency",
  "stripe_customer_id",
  "auto_top_up",
  "auto_top_up_threshold",
  "auto_top_up_amount",
  "created_at",
  "updated_at",
];
const WALLET_TRANSACTION_COLUMNS = [
  "id",
  "user_id",
  "amount",
  "balance_after",
  "type",
  "description",
  "stripe_payment_intent_id",
  "metadata",
  "created_at",
];
const POINTS_LEDGER_COLUMNS = [
  "id",
  "user_id",
  "amount",
  "balance",
  "reason",
  "description",
  "metadata",
  "created_at",
];
const TIER_COLUMNS = [
  "key",
  "name",
  "description",
  "min_points",
  "multiplier",
  "perks",
  "color",
  "icon",
  "achieved_at",
  "created_at",
  "tier_key",
  "user_id",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WalletBalance {
  balance: number;
  lifetimeBalance: number;
  currency: string;
  autoTopUp: boolean;
  tier: UserTierInfo | null;
}

export interface UserTierInfo {
  key: string;
  name: string;
  multiplier: number;
  perks: string[];
  color?: string;
  icon?: string;
  achievedAt: Date;
}

export interface RedemptionItem {
  id: string;
  key: string;
  name: string;
  description: string;
  cost: number;
  type: string;
  value: { cents?: number; days?: number; feature?: string; code?: string };
}

export interface ReferralStats {
  clicks: number;
  signups: number;
  conversions: number;
  rewardsEarned: number;
}

function emptyWallet(): WalletBalance {
  return {
    balance: 0,
    lifetimeBalance: 0,
    currency: "usd",
    autoTopUp: false,
    tier: null,
  };
}

function warnUnavailableStorage(feature: string, userId: string, err: unknown) {
  logger.warn(`${feature} storage is unavailable; returning empty read model`, {
    userId,
    error: String(err),
  });
}

// ── Wallet ────────────────────────────────────────────────────────────────────

export async function getWallet(userId: string): Promise<WalletBalance> {
  const db = getDb();
  let wallet: typeof walletsTable.$inferSelect | undefined;
  try {
    [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
  } catch (err) {
    if (isUnavailableStorageError(err, ["wallets"], WALLET_COLUMNS)) {
      warnUnavailableStorage("Wallet", userId, err);
      return emptyWallet();
    }
    throw err;
  }

  if (!wallet) {
    // Auto-create wallet
    const [created] = await db.insert(walletsTable).values({ userId }).returning();
    const tier = await getCurrentTier(userId);
    return {
      balance: created.balance,
      lifetimeBalance: created.lifetimeBalance,
      currency: created.currency,
      autoTopUp: created.autoTopUp,
      tier,
    };
  }

  const tier = await getCurrentTier(userId);
  return {
    balance: wallet.balance,
    lifetimeBalance: wallet.lifetimeBalance,
    currency: wallet.currency,
    autoTopUp: wallet.autoTopUp,
    tier,
  };
}

export async function topUpWallet(
  userId: string,
  amount: number,
  opts: {
    stripePaymentIntentId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<{ balance: number; transactionId: string }> {
  const result = await topUpWalletRepo(userId, amount, opts);

  // Check tier upgrade after top-up (side-effect, outside tx — idempotent)
  try {
    const wallet = await getWallet(userId);
    await evaluateTierUpgrade(userId, wallet?.lifetimeBalance ?? amount);
  } catch (err) {
    logger.warn("Tier evaluation failed after top-up", { userId, error: String(err) });
  }

  return result;
}

export async function spendFromWallet(
  userId: string,
  amount: number,
  opts: { description?: string; metadata?: Record<string, unknown> } = {}
): Promise<{ balance: number; transactionId: string }> {
  return spendFromWalletRepo(userId, amount, opts);
}

export async function getWalletTransactions(userId: string, limit = 30, offset = 0) {
  const db = getDb();
  try {
    return await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.userId, userId))
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(limit)
      .offset(offset);
  } catch (err) {
    if (isUnavailableStorageError(err, ["wallet_transactions"], WALLET_TRANSACTION_COLUMNS)) {
      warnUnavailableStorage("Wallet transaction", userId, err);
      return [];
    }
    throw err;
  }
}

export async function countWalletTransactions(userId: string): Promise<number> {
  const db = getDb();
  try {
    return await countRows(db, walletTransactionsTable, eq(walletTransactionsTable.userId, userId));
  } catch (err) {
    if (isUnavailableStorageError(err, ["wallet_transactions"], WALLET_TRANSACTION_COLUMNS)) {
      return 0;
    }
    throw err;
  }
}

// ── Points engine ────────────────────────────────────────────────────────────

export type EarnReason =
  | "daily_login"
  | "referral"
  | "achievement"
  | "profile_complete"
  | "first_payment"
  | "tier_bonus"
  | "manual";

export interface EarnPointsResult {
  balance: number;
  lifetimeBalance: number;
  tierUpgraded: boolean;
  newTier?: string;
}

export async function earnPoints(
  userId: string,
  amount: number,
  reason: EarnReason,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<EarnPointsResult> {
  if (amount <= 0) throw new Error("Earn amount must be positive");

  const db = getDb();
  const tier = await getCurrentTier(userId);
  const multiplier = tier?.multiplier ?? 100;
  const adjustedAmount = Math.round((amount * multiplier) / 100);

  // Ensure wallet exists
  const [wallet] = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.userId, userId))
    .limit(1);
  const currentBalance = wallet?.balance ?? 0;
  const currentLifetime = wallet?.lifetimeBalance ?? 0;
  const newBalance = currentBalance + adjustedAmount;
  const newLifetime = currentLifetime + adjustedAmount;

  if (!wallet) {
    await db
      .insert(walletsTable)
      .values({ userId, balance: newBalance, lifetimeBalance: newLifetime });
  } else {
    await db
      .update(walletsTable)
      .set({ balance: newBalance, lifetimeBalance: newLifetime, updatedAt: new Date() })
      .where(eq(walletsTable.userId, userId));
  }

  // Append to points ledger
  await db.insert(pointsLedgerTable).values({
    userId,
    amount: adjustedAmount,
    balance: newBalance,
    reason,
    description: description ?? reason,
    metadata: metadata ?? null,
  });

  // Evaluate tier
  const tierResult = await evaluateTierUpgrade(userId, newLifetime);

  return {
    balance: newBalance,
    lifetimeBalance: newLifetime,
    tierUpgraded: tierResult.upgraded,
    newTier: tierResult.tier,
  };
}

export async function getPointsBalance(
  userId: string
): Promise<{ balance: number; lifetimeBalance: number }> {
  const db = getDb();
  let wallet: typeof walletsTable.$inferSelect | undefined;
  try {
    [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
  } catch (err) {
    if (isUnavailableStorageError(err, ["wallets"], WALLET_COLUMNS)) {
      warnUnavailableStorage("Points balance", userId, err);
      return { balance: 0, lifetimeBalance: 0 };
    }
    throw err;
  }
  return {
    balance: wallet?.balance ?? 0,
    lifetimeBalance: wallet?.lifetimeBalance ?? 0,
  };
}

export async function getPointsHistory(userId: string, limit = 50, offset = 0) {
  const db = getDb();
  try {
    return await db
      .select()
      .from(pointsLedgerTable)
      .where(eq(pointsLedgerTable.userId, userId))
      .orderBy(desc(pointsLedgerTable.createdAt))
      .limit(limit)
      .offset(offset);
  } catch (err) {
    if (isUnavailableStorageError(err, ["points_ledger"], POINTS_LEDGER_COLUMNS)) {
      warnUnavailableStorage("Points history", userId, err);
      return [];
    }
    throw err;
  }
}

export async function countPointsHistory(userId: string): Promise<number> {
  const db = getDb();
  try {
    return await countRows(db, pointsLedgerTable, eq(pointsLedgerTable.userId, userId));
  } catch (err) {
    if (isUnavailableStorageError(err, ["points_ledger"], POINTS_LEDGER_COLUMNS)) {
      return 0;
    }
    throw err;
  }
}

// ── Tier system ───────────────────────────────────────────────────────────────

export async function seedDefaultTiers(): Promise<void> {
  const db = getDb();
  const defaults = [
    {
      key: "bronze",
      name: "Bronze",
      description: "Entry tier",
      minPoints: 0,
      multiplier: 100,
      perks: ["Basic support"],
      color: "#CD7F32",
      icon: "Award",
    },
    {
      key: "silver",
      name: "Silver",
      description: "Active user",
      minPoints: 500,
      multiplier: 125,
      perks: ["Priority support", "Extended trial"],
      color: "#C0C0C0",
      icon: "Star",
    },
    {
      key: "gold",
      name: "Gold",
      description: "Power user",
      minPoints: 2000,
      multiplier: 150,
      perks: ["Priority support", "API rate boost", "Custom branding"],
      color: "#FFD700",
      icon: "Crown",
    },
    {
      key: "platinum",
      name: "Platinum",
      description: "Enterprise",
      minPoints: 10000,
      multiplier: 200,
      perks: ["Dedicated support", "SLA guarantee", "White-label", "Custom integrations"],
      color: "#E5E4E2",
      icon: "Gem",
    },
  ];

  for (const tier of defaults) {
    await db.insert(tiersTable).values(tier).onConflictDoNothing();
  }
}

export async function getCurrentTier(userId: string): Promise<UserTierInfo | null> {
  const db = getDb();
  let userTier:
    | {
        tier: typeof tiersTable.$inferSelect;
        achievedAt: Date;
      }
    | undefined;
  try {
    [userTier] = await db
      .select({ tier: tiersTable, achievedAt: userTiersTable.achievedAt })
      .from(userTiersTable)
      .innerJoin(tiersTable, eq(userTiersTable.tierKey, tiersTable.key))
      .where(eq(userTiersTable.userId, userId))
      .limit(1);
  } catch (err) {
    if (isUnavailableStorageError(err, ["user_tiers", "tiers"], TIER_COLUMNS)) {
      warnUnavailableStorage("Tier", userId, err);
      return null;
    }
    throw err;
  }

  if (!userTier) return null;

  return {
    key: userTier.tier.key,
    name: userTier.tier.name,
    multiplier: userTier.tier.multiplier,
    perks: userTier.tier.perks ?? [],
    color: userTier.tier.color ?? undefined,
    icon: userTier.tier.icon ?? undefined,
    achievedAt: userTier.achievedAt,
  };
}

export async function evaluateTierUpgrade(
  userId: string,
  lifetimeBalance: number
): Promise<{ upgraded: boolean; tier?: string }> {
  const db = getDb();
  await seedDefaultTiers();

  // Find the highest tier the user qualifies for
  const [bestTier] = await db
    .select()
    .from(tiersTable)
    .where(sql`${tiersTable.minPoints} <= ${lifetimeBalance}`)
    .orderBy(sql`${tiersTable.minPoints} DESC`)
    .limit(1);

  if (!bestTier) return { upgraded: false };

  const [currentTier] = await db
    .select()
    .from(userTiersTable)
    .where(eq(userTiersTable.userId, userId))
    .limit(1);

  if (!currentTier || currentTier.tierKey !== bestTier.key) {
    await db
      .insert(userTiersTable)
      .values({ userId, tierKey: bestTier.key })
      .onConflictDoUpdate({
        target: userTiersTable.userId,
        set: { tierKey: bestTier.key, achievedAt: new Date() },
      });

    // Award tier bonus points
    const bonusMap: Record<string, number> = { silver: 100, gold: 500, platinum: 2000 };
    const bonus = bonusMap[bestTier.key];
    if (bonus && !currentTier) {
      await earnPoints(userId, bonus, "tier_bonus", `Reached ${bestTier.name} tier!`);
    }

    return { upgraded: true, tier: bestTier.key };
  }

  return { upgraded: false };
}

// ── Redemption catalog ────────────────────────────────────────────────────────

export async function seedDefaultRedemptions(): Promise<void> {
  const db = getDb();
  const defaults = [
    {
      key: "account_credit_5",
      name: "$5 Account Credit",
      description: "$5 credit to your account",
      cost: 500,
      type: "account_credit",
      value: { cents: 500 },
    },
    {
      key: "account_credit_10",
      name: "$10 Account Credit",
      description: "$10 credit to your account",
      cost: 900,
      type: "account_credit",
      value: { cents: 1000 },
    },
    {
      key: "extended_trial_7",
      name: "7-Day Trial Extension",
      description: "Add 7 days to your trial",
      cost: 300,
      type: "extended_trial",
      value: { days: 7 },
    },
    {
      key: "extended_trial_30",
      name: "30-Day Trial Extension",
      description: "Add 30 days to your trial",
      cost: 1000,
      type: "extended_trial",
      value: { days: 30 },
    },
    {
      key: "swag_code",
      name: "Swag Code",
      description: "Exclusive swag discount code",
      cost: 2000,
      type: "swag",
      value: { code: "SWAG-{random}" },
    },
  ];

  for (const item of defaults) {
    await db.insert(redemptionsCatalogTable).values(item).onConflictDoNothing();
  }
}

export async function getRedemptionCatalog(): Promise<RedemptionItem[]> {
  const db = getDb();
  await seedDefaultRedemptions();
  const items = await db
    .select()
    .from(redemptionsCatalogTable)
    .where(eq(redemptionsCatalogTable.active, true));
  return items.map((i) => ({
    id: i.id,
    key: i.key,
    name: i.name,
    description: i.description ?? "",
    cost: i.cost,
    type: i.type,
    value: i.value ?? {},
  }));
}

export async function redeemItem(
  userId: string,
  catalogKey: string
): Promise<{ success: boolean; redemptionId: string; message: string }> {
  const db = getDb();
  await seedDefaultRedemptions();

  const [item] = await db
    .select()
    .from(redemptionsCatalogTable)
    .where(
      and(eq(redemptionsCatalogTable.key, catalogKey), eq(redemptionsCatalogTable.active, true))
    )
    .limit(1);

  if (!item) throw new Error("Redemption item not found");

  const [wallet] = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.userId, userId))
    .limit(1);
  const balance = wallet?.balance ?? 0;

  if (balance < item.cost) {
    return {
      success: false,
      redemptionId: "",
      message: `Insufficient points: need ${item.cost}, have ${balance}`,
    };
  }

  // Deduct points
  await spendFromWallet(userId, item.cost, { description: `Redeemed: ${item.name}` });

  // Create redemption record
  const [redemption] = await db
    .insert(redemptionsTable)
    .values({
      userId,
      catalogId: item.id,
      pointsSpent: item.cost,
      status: "completed",
      fulfilledAt: new Date(),
      metadata: { itemKey: item.key, itemType: item.type },
    })
    .returning();

  return {
    success: true,
    redemptionId: redemption.id,
    message: `Successfully redeemed: ${item.name}`,
  };
}

// ── Referrals ─────────────────────────────────────────────────────────────────

function generateReferralCode(): string {
  return generateCodeFromAlphabet(8);
}

export async function createReferralLink(
  userId: string,
  slug?: string
): Promise<{ code: string; slug: string }> {
  const db = getDb();
  const code = generateReferralCode();
  const finalSlug = slug?.toLowerCase().replace(/[^a-z0-9-]/g, "") ?? code.toLowerCase();

  await db.insert(referralsTable).values({
    referrerUserId: userId,
    code,
    slug: finalSlug,
  });

  return { code, slug: finalSlug };
}

export async function getReferralByCode(code: string) {
  const db = getDb();
  const [ref] = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.code, code))
    .limit(1);
  return ref ?? null;
}

export async function getReferralBySlug(slug: string) {
  const db = getDb();
  const [ref] = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.slug, slug))
    .limit(1);
  return ref ?? null;
}

export async function trackReferralClick(
  referralCode: string,
  ipAddress: string,
  userAgent: string,
  utmSource?: string,
  utmMedium?: string,
  utmCampaign?: string
): Promise<string | null> {
  const db = getDb();
  const ref = await getReferralByCode(referralCode);
  if (!ref?.active) return null;

  await db
    .update(referralsTable)
    .set({ clicks: ref.clicks + 1 })
    .where(eq(referralsTable.id, ref.id));

  const [tracking] = await db
    .insert(referralTrackingTable)
    .values({
      referralId: ref.id,
      ipAddress,
      userAgent,
      utmSource: utmSource ?? null,
      utmMedium: utmMedium ?? null,
      utmCampaign: utmCampaign ?? null,
      status: "clicked",
    })
    .returning();

  return tracking.id;
}

export async function trackReferralSignup(trackingId: string, userId: string): Promise<void> {
  const db = getDb();
  const [tracking] = await db
    .select({ referral: referralTrackingTable, ref: referralsTable })
    .from(referralTrackingTable)
    .innerJoin(referralsTable, eq(referralTrackingTable.referralId, referralsTable.id))
    .where(eq(referralTrackingTable.id, trackingId))
    .limit(1);

  if (!tracking) return;

  // Prevent self-referral
  if (tracking.ref.referrerUserId === userId) return;

  await db
    .update(referralTrackingTable)
    .set({ status: "signed_up", referredUserId: userId, signedUpAt: new Date() })
    .where(eq(referralTrackingTable.id, trackingId));

  await db
    .update(referralsTable)
    .set({ signups: tracking.ref.signups + 1 })
    .where(eq(referralsTable.id, tracking.ref.id));
}

export async function trackReferralConversion(userId: string, _amount: number): Promise<void> {
  const db = getDb();
  const [tracking] = await db
    .select({ referral: referralTrackingTable, ref: referralsTable })
    .from(referralTrackingTable)
    .innerJoin(referralsTable, eq(referralTrackingTable.referralId, referralsTable.id))
    .where(
      and(
        eq(referralTrackingTable.referredUserId, userId),
        eq(referralTrackingTable.status, "signed_up")
      )
    )
    .limit(1);

  if (!tracking) return;

  await db
    .update(referralTrackingTable)
    .set({ status: "converted", convertedAt: new Date() })
    .where(eq(referralTrackingTable.id, tracking.referral.id));

  await db
    .update(referralsTable)
    .set({ conversions: tracking.ref.conversions + 1 })
    .where(eq(referralsTable.id, tracking.ref.id));

  // Award referral points to referrer
  const rewardPoints = 500; // 500 points per conversion
  const [referrer] = await db
    .select({ referrerUserId: referralsTable.referrerUserId })
    .from(referralsTable)
    .where(eq(referralsTable.id, tracking.ref.id))
    .limit(1);

  if (referrer) {
    await earnPoints(
      referrer.referrerUserId,
      rewardPoints,
      "referral",
      `Referral conversion: ${userId}`
    );
    await db
      .update(referralsTable)
      .set({ rewardsEarned: tracking.ref.rewardsEarned + rewardPoints })
      .where(eq(referralsTable.id, tracking.ref.id));
  }
}

export async function getReferralStats(userId: string): Promise<{
  totalClicks: number;
  totalSignups: number;
  totalConversions: number;
  totalRewards: number;
  links: Array<{
    code: string;
    slug: string;
    clicks: number;
    signups: number;
    conversions: number;
    rewardsEarned: number;
  }>;
}> {
  const db = getDb();
  let links: (typeof referralsTable.$inferSelect)[];
  try {
    links = await db
      .select()
      .from(referralsTable)
      .where(eq(referralsTable.referrerUserId, userId))
      .orderBy(desc(referralsTable.createdAt));
  } catch (err) {
    if (
      isUnavailableStorageError(
        err,
        ["referrals"],
        [
          "referrer_user_id",
          "code",
          "slug",
          "clicks",
          "signups",
          "conversions",
          "rewards_earned",
          "active",
          "created_at",
        ]
      )
    ) {
      return {
        totalClicks: 0,
        totalSignups: 0,
        totalConversions: 0,
        totalRewards: 0,
        links: [],
      };
    }
    throw err;
  }

  let totalClicks = 0,
    totalSignups = 0,
    totalConversions = 0,
    totalRewards = 0;
  for (const link of links) {
    totalClicks += link.clicks;
    totalSignups += link.signups;
    totalConversions += link.conversions;
    totalRewards += link.rewardsEarned;
  }

  return {
    totalClicks,
    totalSignups,
    totalConversions,
    totalRewards,
    links: links.map((l) => ({
      code: l.code,
      slug: l.slug,
      clicks: l.clicks,
      signups: l.signups,
      conversions: l.conversions,
      rewardsEarned: l.rewardsEarned,
    })),
  };
}

export async function getReferralDashboard(userId: string) {
  const stats = await getReferralStats(userId);
  const [user] = await getDb()
    .select({ displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  return {
    ...stats,
    displayName: user?.displayName ?? "",
    referralUrlBase: process.env.APP_URL ? `${process.env.APP_URL}/r/` : "/r/",
  };
}
