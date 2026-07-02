import { eq } from "drizzle-orm";
import { getDb } from "..";
import { subscriptionsTable } from "../schema";

export interface SubscriptionLifecycleUpdateInput {
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  stripeProductId: string | null;
  plan: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd: Date | null;
  canceledAt?: Date;
}

export interface CheckoutSubscriptionInput extends SubscriptionLifecycleUpdateInput {
  userId: string | null;
  orgId: string | null;
  stripeCustomerId: string | null;
}

export async function upsertCheckoutSubscription(input: CheckoutSubscriptionInput): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const values = { ...input };
    await tx
      .insert(subscriptionsTable)
      .values(values)
      .onConflictDoUpdate({
        target: input.orgId ? subscriptionsTable.orgId : subscriptionsTable.userId,
        set: { ...values, updatedAt: new Date() },
      });
  });
}

export async function applySubscriptionLifecycleUpdate(
  input: SubscriptionLifecycleUpdateInput
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptionsTable)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(subscriptionsTable.stripeSubscriptionId, input.stripeSubscriptionId));
  });
}

export async function setSubscriptionPaused(input: {
  subscriptionId: string;
  userId: string;
  reason?: unknown;
}): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptionsTable)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, input.subscriptionId));
  });
}

export async function scheduleSubscriptionCancellation(input: {
  subscriptionId: string;
  userId: string;
  reason?: unknown;
}): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptionsTable)
      .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, input.subscriptionId));
  });
}

export async function reactivateSubscription(input: { subscriptionId: string }): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptionsTable)
      .set({ cancelAtPeriodEnd: false, status: "active", updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, input.subscriptionId));
  });
}

export async function recordInvoicePaymentFailure(input: {
  subscriptionId: string;
  existingMetadata: Record<string, unknown>;
  wasAlreadyPastDue: boolean;
}): Promise<void> {
  const metadata = { ...input.existingMetadata };
  if (!input.wasAlreadyPastDue || !metadata.dunningStartedAt) {
    metadata.dunningStartedAt = new Date().toISOString();
    metadata.dunningStagesSent = [];
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptionsTable)
      .set({ status: "past_due", metadata, updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, input.subscriptionId));
  });
}

export async function clearSubscriptionDunning(input: { subscriptionId: string }): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptionsTable)
      .set({ status: "active", metadata: {}, updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, input.subscriptionId));
  });
}
