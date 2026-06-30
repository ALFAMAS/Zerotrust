/**
 * Stripe webhook idempotency repository.
 *
 * Stripe guarantees *at-least-once* delivery: the same event can arrive more
 * than once (network retries, manual replays from the dashboard, or an attacker
 * replaying a captured-but-valid payload). Reprocessing a `checkout.session.completed`
 * or `customer.subscription.updated` twice corrupts subscription state, so every
 * event id we apply is recorded here and a redelivery becomes a no-op.
 *
 * This is the first member of the repository layer described in the TODO —
 * hot-path writes move behind small, testable functions with explicit
 * transactional/idempotent semantics instead of inline Drizzle calls.
 */
import { eq } from "drizzle-orm";
import { getDb } from "..";
import { processedStripeEventsTable } from "../schema";

/**
 * Atomically claim a Stripe event id for processing.
 *
 * Returns `true` if this call won the claim (the event has not been seen before)
 * and the caller should process it; returns `false` if the event was already
 * recorded (duplicate / replay) and the caller must skip it.
 *
 * The claim is a single `INSERT ... ON CONFLICT DO NOTHING` so concurrent
 * deliveries of the same event race on the primary key and exactly one wins.
 */
export async function claimStripeEvent(eventId: string, type: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .insert(processedStripeEventsTable)
    .values({ eventId, type })
    .onConflictDoNothing()
    .returning({ eventId: processedStripeEventsTable.eventId });
  return rows.length > 0;
}

/**
 * Release a previously claimed event so Stripe's next retry reprocesses it.
 *
 * Called only when processing fails *after* the claim was recorded — without
 * this, a transient downstream error (DB blip, Stripe API timeout) would leave
 * the event marked processed while its mutation never applied, silently dropping
 * the update. Best-effort: a failed release is logged by the caller, not thrown.
 */
export async function releaseStripeEvent(eventId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(processedStripeEventsTable)
    .where(eq(processedStripeEventsTable.eventId, eventId));
}
