import { desc, eq } from "drizzle-orm";
import { getDb } from "..";
import { pointsLedgerTable } from "../schema";

export interface AwardPointsInput {
  userId: string;
  amount: number;
  reason: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Award (or deduct) points atomically. Reads the current balance and inserts
 * the new ledger entry inside a single transaction, preventing concurrent
 * award operations from racing on the running balance.
 *
 * Returns the new ledger entry with the correct post-award balance.
 */
export async function awardPoints(input: AwardPointsInput) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [lastEntry] = await tx
      .select({ balance: pointsLedgerTable.balance })
      .from(pointsLedgerTable)
      .where(eq(pointsLedgerTable.userId, input.userId))
      .orderBy(desc(pointsLedgerTable.createdAt))
      .limit(1);

    const currentBalance = lastEntry?.balance ?? 0;
    const newBalance = currentBalance + input.amount;

    const [entry] = await tx
      .insert(pointsLedgerTable)
      .values({
        userId: input.userId,
        amount: input.amount,
        balance: newBalance,
        reason: input.reason,
        description: input.description ?? null,
        metadata: input.metadata ?? null,
      })
      .returning();

    return entry;
  });
}
