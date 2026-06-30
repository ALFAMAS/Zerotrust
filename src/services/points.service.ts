import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { pointsLedgerTable } from "../db/schema";
import { getLogger } from "../logger";
import { awardPoints as awardPointsTransactional } from "../db/repositories/pointsLedger.repository";

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
        message
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
 * Award (or deduct) points for a user via the transactional repository.
 * The repo wraps the read-balance + insert-entry in a single transaction,
 * preventing concurrent award operations from racing on the running balance.
 */
export async function awardPoints(input: AwardPointsInput) {
  try {
    const entry = await awardPointsTransactional(input);
    logger.info("Points awarded", {
      userId: input.userId,
      amount: input.amount,
      balance: entry.balance,
      reason: input.reason,
    });
    return entry;
  } catch (err) {
    if (isMissingPointsStorageError(err)) {
      logger.warn("Points storage is unavailable; points not recorded", {
        userId: input.userId,
        error: String(err),
      });
      return null;
    }
    throw err;
  }
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
