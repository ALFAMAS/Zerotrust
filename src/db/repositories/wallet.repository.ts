import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "..";
import { walletsTable, walletTransactionsTable } from "../schema";

/**
 * Add funds to a user's wallet atomically. Creates the wallet row if it does
 * not exist, then records the transaction — all inside a single database
 * transaction so concurrent top-ups can never double-count or lose funds.
 */
export async function topUpWallet(
  userId: string,
  amount: number,
  opts: {
    stripePaymentIntentId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<{ balance: number; transactionId: string }> {
  if (amount <= 0) throw new Error("Top-up amount must be positive");

  const db = getDb();
  return db.transaction(async (tx) => {
    // Stripe webhook retries must not double-credit the same payment intent.
    if (opts.stripePaymentIntentId) {
      const [existing] = await tx
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.stripePaymentIntentId, opts.stripePaymentIntentId))
        .limit(1);
      if (existing) {
        return { balance: existing.balanceAfter, transactionId: existing.id };
      }
    }

    const [wallet] = await tx
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, userId))
      .limit(1);

    if (!wallet) {
      await tx.insert(walletsTable).values({ userId, balance: 0, lifetimeBalance: 0 });
    }

    // Atomic SQL increment — mirrors spendFromWallet's conditional UPDATE so
    // concurrent top-ups cannot clobber each other under READ COMMITTED.
    const [updated] = await tx
      .update(walletsTable)
      .set({
        balance: sql`${walletsTable.balance} + ${amount}`,
        lifetimeBalance: sql`${walletsTable.lifetimeBalance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(walletsTable.userId, userId))
      .returning({ balance: walletsTable.balance });

    if (!updated) {
      throw new Error("Wallet not found after insert");
    }

    const newBalance = updated.balance;

    const [txn] = await tx
      .insert(walletTransactionsTable)
      .values({
        userId,
        amount,
        balanceAfter: newBalance,
        type: "top_up",
        description: opts.description ?? "Wallet top-up",
        stripePaymentIntentId: opts.stripePaymentIntentId ?? null,
        metadata: opts.metadata ?? null,
      })
      .returning();

    return { balance: newBalance, transactionId: txn.id };
  });
}

/**
 * Spend from a user's wallet atomically. Uses a conditional UPDATE
 * (`balance >= amount`) as the TOCTOU guard so two concurrent spends from a
 * stale read can never both debit the same balance. The transaction insert
 * is also inside the same tx so the ledger is consistent.
 */
export async function spendFromWallet(
  userId: string,
  amount: number,
  opts: { description?: string; metadata?: Record<string, unknown> } = {}
): Promise<{ balance: number; transactionId: string }> {
  if (amount <= 0) throw new Error("Spend amount must be positive");

  const db = getDb();
  return db.transaction(async (tx) => {
    // Optimistic read for the error message — the real guard is the
    // conditional UPDATE below.
    const [wallet] = await tx
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, userId))
      .limit(1);
    if (!wallet) throw new Error("Wallet not found");

    const debited = await tx
      .update(walletsTable)
      .set({ balance: sql`${walletsTable.balance} - ${amount}`, updatedAt: new Date() })
      .where(and(eq(walletsTable.userId, userId), gte(walletsTable.balance, amount)))
      .returning({ balance: walletsTable.balance });

    if (debited.length === 0) {
      throw new Error(`Insufficient balance: ${wallet.balance} < ${amount}`);
    }
    const newBalance = debited[0].balance;

    const [txn] = await tx
      .insert(walletTransactionsTable)
      .values({
        userId,
        amount: -amount,
        balanceAfter: newBalance,
        type: "spend",
        description: opts.description ?? "Wallet spend",
        metadata: opts.metadata ?? null,
      })
      .returning();

    return { balance: newBalance, transactionId: txn.id };
  });
}
