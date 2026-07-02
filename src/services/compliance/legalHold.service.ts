import { eq } from "drizzle-orm";
import { getDb } from "../../db/index";
import { usersTable } from "../../db/schema";
import { getLogger } from "../../logger/index";

const logger = getLogger("legal-hold");

/**
 * Legal hold marks an account's data as exempt from retention auto-purge, so it
 * survives the normal cleanup windows for legal/e-discovery defensibility.
 */
export async function setLegalHold(
  userId: string,
  hold: boolean,
  opts: { reason?: string; by?: string } = {}
): Promise<boolean> {
  const db = getDb();
  const [updated] = await db
    .update(usersTable)
    .set({
      legalHold: hold,
      legalHoldReason: hold ? (opts.reason ?? null) : null,
      legalHoldAt: hold ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id });
  if (updated) {
    logger.info(`Legal hold ${hold ? "placed" : "lifted"}`, { userId, by: opts.by });
  }
  return Boolean(updated);
}

/**
 * IDs of all accounts currently under legal hold. Defensive: returns [] on any
 * error so a lookup failure can never accidentally widen a purge.
 */
export async function getHeldUserIds(): Promise<string[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.legalHold, true));
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}
