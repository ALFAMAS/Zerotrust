/**
 * Billing lifecycle scheduler — runs daily and drives three email sequences:
 *
 *  1. Trial expiry   — "trial ending soon" 3 days before trialEnd, and an
 *                      upgrade prompt the day the trial lapses.
 *  2. Dunning        — payment failed: escalating reminders on day 3, 7 and
 *                      14 after the subscription went past_due, with a link
 *                      to update the payment method.
 *  3. Win-back       — canceled subscriptions get a "we miss you" email on
 *                      day 7, 30 and 90 after cancellation.
 *
 * Sent-stage tracking lives in the subscription's metadata jsonb so no
 * extra tables are needed and emails are never sent twice for a stage.
 */

import { eq, and, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { subscriptionsTable, usersTable } from "../db/schema";
import { sendBillingEventEmail } from "./email.service";
import { getLogger } from "../logger";

const logger = getLogger("billing-lifecycle");

const DAY_MS = 24 * 60 * 60 * 1000;
const APP_URL = () => process.env.APP_URL ?? "http://localhost:3000";

export const DUNNING_DAYS = [3, 7, 14];
export const WINBACK_DAYS = [7, 30, 90];
export const TRIAL_WARNING_DAYS = 3;

type SubRow = typeof subscriptionsTable.$inferSelect;

interface LifecycleMeta {
  trialWarningSentAt?: string;
  trialEndedSentAt?: string;
  dunningStartedAt?: string;
  dunningStagesSent?: number[];
  winbackStagesSent?: number[];
  [key: string]: unknown;
}

function meta(sub: SubRow): LifecycleMeta {
  return (sub.metadata as LifecycleMeta) ?? {};
}

async function emailOwner(
  sub: SubRow,
  payload: { title: string; body: string; ctaLabel?: string; ctaUrl?: string }
): Promise<boolean> {
  if (!sub.userId) return false;
  const db = getDb();
  const [user] = await db
    .select({ email: usersTable.email, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, sub.userId))
    .limit(1);
  if (!user) return false;
  await sendBillingEventEmail(user.email, {
    name: user.displayName ?? user.email,
    ...payload,
  });
  return true;
}

async function saveMeta(subId: string, patch: LifecycleMeta, current: LifecycleMeta) {
  const db = getDb();
  await db
    .update(subscriptionsTable)
    .set({ metadata: { ...current, ...patch }, updatedAt: new Date() })
    .where(eq(subscriptionsTable.id, subId));
}

// ── 1. Trial expiry ───────────────────────────────────────────────────────────

export async function processTrialExpiry(now = new Date()): Promise<number> {
  const db = getDb();
  const trialing = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.status, "trialing"), isNotNull(subscriptionsTable.trialEnd)));

  let sent = 0;
  for (const sub of trialing) {
    const m = meta(sub);
    const trialEnd = sub.trialEnd as Date;
    const msLeft = trialEnd.getTime() - now.getTime();

    if (msLeft <= 0 && !m.trialEndedSentAt) {
      const ok = await emailOwner(sub, {
        title: "Your trial has ended",
        body: "Your free trial is over. Upgrade now to keep access to Pro features — your data and settings are exactly where you left them.",
        ctaLabel: "Upgrade now",
        ctaUrl: `${APP_URL()}/dashboard/billing`,
      });
      if (ok) {
        await saveMeta(sub.id, { trialEndedSentAt: now.toISOString() }, m);
        sent++;
      }
    } else if (msLeft > 0 && msLeft <= TRIAL_WARNING_DAYS * DAY_MS && !m.trialWarningSentAt) {
      const daysLeft = Math.max(1, Math.ceil(msLeft / DAY_MS));
      const ok = await emailOwner(sub, {
        title: `Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        body: "Your free trial is ending soon. Add a payment method to keep your Pro features without interruption.",
        ctaLabel: "Add payment method",
        ctaUrl: `${APP_URL()}/dashboard/billing`,
      });
      if (ok) {
        await saveMeta(sub.id, { trialWarningSentAt: now.toISOString() }, m);
        sent++;
      }
    }
  }
  return sent;
}

// ── 2. Dunning ────────────────────────────────────────────────────────────────

export async function processDunning(now = new Date()): Promise<number> {
  const db = getDb();
  const pastDue = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.status, "past_due"));

  let sent = 0;
  for (const sub of pastDue) {
    const m = meta(sub);
    // dunningStartedAt is stamped by the invoice.payment_failed webhook;
    // fall back to updatedAt for subscriptions flagged before this feature.
    const startedAt = m.dunningStartedAt ? new Date(m.dunningStartedAt) : sub.updatedAt;
    const daysSince = Math.floor((now.getTime() - startedAt.getTime()) / DAY_MS);
    const stagesSent = m.dunningStagesSent ?? [];

    for (const stage of DUNNING_DAYS) {
      if (daysSince >= stage && !stagesSent.includes(stage)) {
        const isFinal = stage === DUNNING_DAYS[DUNNING_DAYS.length - 1];
        const ok = await emailOwner(sub, {
          title: isFinal
            ? "Final notice: your subscription will be canceled"
            : "Payment failed — action needed",
          body: isFinal
            ? "We still couldn't process your payment. Your subscription will be canceled and your account downgraded to the Free plan unless you update your payment method today."
            : `We couldn't process your last payment (${daysSince} days ago). Please update your payment method to avoid losing access to your plan.`,
          ctaLabel: "Update payment method",
          ctaUrl: `${APP_URL()}/dashboard/billing`,
        });
        if (ok) {
          stagesSent.push(stage);
          await saveMeta(sub.id, { dunningStagesSent: stagesSent }, m);
          sent++;
        }
        break; // at most one dunning email per run
      }
    }
  }
  return sent;
}

// ── 3. Win-back ───────────────────────────────────────────────────────────────

export async function processWinback(now = new Date()): Promise<number> {
  const db = getDb();
  const canceled = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(eq(subscriptionsTable.status, "canceled"), isNotNull(subscriptionsTable.canceledAt))
    );

  let sent = 0;
  for (const sub of canceled) {
    const m = meta(sub);
    const canceledAt = sub.canceledAt as Date;
    const daysSince = Math.floor((now.getTime() - canceledAt.getTime()) / DAY_MS);
    const stagesSent = m.winbackStagesSent ?? [];

    for (const stage of WINBACK_DAYS) {
      if (daysSince >= stage && !stagesSent.includes(stage)) {
        const coupon = process.env.STRIPE_WINBACK_COUPON;
        const ok = await emailOwner(sub, {
          title: "We'd love to have you back",
          body: coupon
            ? `It's been a while since you canceled. Come back and use code ${coupon} for a discount on your first month — your workspace is waiting exactly as you left it.`
            : "It's been a while since you canceled. Your workspace is waiting exactly as you left it — reactivate any time with one click.",
          ctaLabel: "Reactivate my plan",
          ctaUrl: `${APP_URL()}/dashboard/billing`,
        });
        if (ok) {
          stagesSent.push(stage);
          await saveMeta(sub.id, { winbackStagesSent: stagesSent }, m);
          sent++;
        }
        break;
      }
    }
  }
  return sent;
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export async function runBillingLifecycle(): Promise<{
  trial: number;
  dunning: number;
  winback: number;
}> {
  const results = { trial: 0, dunning: 0, winback: 0 };
  try {
    results.trial = await processTrialExpiry();
  } catch (err) {
    logger.error("Trial expiry processing failed", err as Error);
  }
  try {
    results.dunning = await processDunning();
  } catch (err) {
    logger.error("Dunning processing failed", err as Error);
  }
  try {
    results.winback = await processWinback();
  } catch (err) {
    logger.error("Win-back processing failed", err as Error);
  }
  if (results.trial || results.dunning || results.winback) {
    logger.info("Billing lifecycle run complete", results);
  }
  return results;
}

let lifecycleInterval: ReturnType<typeof setInterval> | null = null;

export function startBillingLifecycleScheduler(intervalHours = 24): void {
  if (lifecycleInterval) clearInterval(lifecycleInterval);
  lifecycleInterval = setInterval(
    () => {
      void runBillingLifecycle();
    },
    intervalHours * 60 * 60 * 1000
  );
  if (lifecycleInterval.unref) lifecycleInterval.unref();
  logger.info("Billing lifecycle scheduler started", { intervalHours });
}

export function stopBillingLifecycleScheduler(): void {
  if (lifecycleInterval) {
    clearInterval(lifecycleInterval);
    lifecycleInterval = null;
  }
}
