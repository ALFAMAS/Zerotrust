import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { pointsLedgerTable } from "../db/schema";
import { getLogger } from "../logger";

const logger = getLogger("points-service");

function isMissingPointsStorageError(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (candidate.code === "42P01" || candidate.code === "42703") return true;

    const message = typeof candidate.message === "string" ? candidate.message : "";
    if (
      /relation\s+["']?points_ledger["']?\s+does not exist/i.test(message) ||
      /column\s+["']?(balance|amount|reason|description|metadata|created_at)["']?\s+does not exist/i.test(
        message,
      )
    ) {
      return true;
    }

    current = candidate.cause;
  }
  return false;
}

export interface AwardPointsInput {
  userId: string;
  amount: number;
  reason: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Award (or deduct) points for a user. Creates a new ledger entry with the
 * running balance. Returns the new ledger entry.
 */
export async function awardPoints(input: AwardPointsInput) {
  const db = getDb();

  // Get current balance (last ledger entry)
  const [lastEntry] = await db
    .select({ balance: pointsLedgerTable.balance })
    .from(pointsLedgerTable)
    .where(eq(pointsLedgerTable.userId, input.userId))
    .orderBy(desc(pointsLedgerTable.createdAt))
    .limit(1);

  const currentBalance = lastEntry?.balance ?? 0;
  const newBalance = currentBalance + input.amount;

  const [entry] = await db
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

  logger.info("Points awarded", {
    userId: input.userId,
    amount: input.amount,
    balance: newBalance,
    reason: input.reason,
  });

  return entry;
}

/**
 * Get the current point balance for a user.
 */
export async function getPointsBalance(userId: string): Promise<number> {
  const db = getDb();
  try {
    const [lastEntry] = await db
      .select({ balance: pointsLedgerTable.balance })
      .from(pointsLedgerTable)
      .where(eq(pointsLedgerTable.userId, userId))
      .orderBy(desc(pointsLedgerTable.createdAt))
      .limit(1);

    return lastEntry?.balance ?? 0;
  } catch (err) {
    if (isMissingPointsStorageError(err)) {
      logger.warn("Points storage is unavailable; returning zero balance", {
        userId,
        error: String(err),
      });
      return 0;
    }
    throw err;
  }
}

/**
 * Get the points ledger (history) for a user, newest first.
 */
export async function getPointsHistory(userId: string, limit = 50, offset = 0) {
  const db = getDb();
  try {
    const entries = await db
      .select()
      .from(pointsLedgerTable)
      .where(eq(pointsLedgerTable.userId, userId))
      .orderBy(desc(pointsLedgerTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select()
      .from(pointsLedgerTable)
      .where(eq(pointsLedgerTable.userId, userId));

    return { entries, total: countResult ? undefined : entries.length };
  } catch (err) {
    if (isMissingPointsStorageError(err)) {
      logger.warn("Points storage is unavailable; returning empty history", {
        userId,
        error: String(err),
      });
      return { entries: [], total: 0 };
    }
    throw err;
  }
}
