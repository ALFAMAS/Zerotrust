import { desc, eq } from "drizzle-orm";
import { getDb } from "..";
import { pointsLedgerTable } from "../schema";

export interface AwardPointsInput {
  userId: string;
  points: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append a points-ledger entry atomically. The latest balance read and the next
 * ledger insert live in one transaction so concurrent awards cannot calculate
 * from a stale balance outside the write boundary.
 */
export async function awardPoints(input: AwardPointsInput) {
  if (input.points <= 0) throw new Error("Points award must be positive");

  const db = getDb();
  return db.transaction(async (tx) => {
    const [lastEntry] = await tx
      .select({ balanceAfter: pointsLedgerTable.balanceAfter })
      .from(pointsLedgerTable)
      .where(eq(pointsLedgerTable.userId, input.userId))
      .orderBy(desc(pointsLedgerTable.createdAt))
      .limit(1);

    const balanceAfter = (lastEntry?.balanceAfter ?? 0) + input.points;
    const [entry] = await tx
      .insert(pointsLedgerTable)
      .values({
        userId: input.userId,
        points: input.points,
        balanceAfter,
        reason: input.reason,
        metadata: input.metadata ?? null,
      })
      .returning();

    if (!entry) throw new Error("POINTS_LEDGER_INSERT_FAILED");
    return entry;
  });
}
