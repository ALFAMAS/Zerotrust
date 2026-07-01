import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  spendFromWallet as spendFromWalletRepo,
  topUpWallet as topUpWalletRepo,
} from "../db/repositories/wallet.repository";
import { walletsTable, walletTransactionsTable } from "../db/schema";
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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WalletBalance {
  balance: number;
  lifetimeBalance: number;
  currency: string;
  autoTopUp: boolean;
}

function emptyWallet(): WalletBalance {
  return {
    balance: 0,
    lifetimeBalance: 0,
    currency: "usd",
    autoTopUp: false,
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
    return {
      balance: created.balance,
      lifetimeBalance: created.lifetimeBalance,
      currency: created.currency,
      autoTopUp: created.autoTopUp,
    };
  }

  return {
    balance: wallet.balance,
    lifetimeBalance: wallet.lifetimeBalance,
    currency: wallet.currency,
    autoTopUp: wallet.autoTopUp,
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
  return topUpWalletRepo(userId, amount, opts);
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
