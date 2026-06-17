import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { emailSuppressionsTable } from "../db/schema";
import { getLogger } from "../logger";

const logger = getLogger("email-suppression");

export type SuppressionReason = "bounce" | "complaint" | "manual" | "unsubscribe";

/**
 * Is this address on the suppression list? Defensive: returns false on any error
 * so a lookup failure never silently drops a legitimate email (and so unit tests
 * that don't wire a DB behave as before).
 */
export async function isEmailSuppressed(email: string): Promise<boolean> {
  if (!email) return false;
  try {
    const db = getDb();
    const [row] = await db
      .select({ email: emailSuppressionsTable.email })
      .from(emailSuppressionsTable)
      .where(eq(emailSuppressionsTable.email, email.toLowerCase()))
      .limit(1);
    return Boolean(row);
  } catch {
    return false;
  }
}

/** Add an address to the suppression list (idempotent upsert). */
export async function suppressEmail(
  email: string,
  reason: SuppressionReason,
  detail?: string
): Promise<void> {
  const normalized = email.toLowerCase();
  const db = getDb();
  await db
    .insert(emailSuppressionsTable)
    .values({ email: normalized, reason, detail: detail ?? null })
    .onConflictDoUpdate({
      target: emailSuppressionsTable.email,
      set: { reason, detail: detail ?? null },
    });
  logger.info("Email suppressed", { email: normalized, reason });
}

/** Remove an address from the suppression list (e.g. user re-confirms). */
export async function unsuppressEmail(email: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .delete(emailSuppressionsTable)
    .where(eq(emailSuppressionsTable.email, email.toLowerCase()));
  return ((result as any).rowCount ?? 0) > 0;
}
