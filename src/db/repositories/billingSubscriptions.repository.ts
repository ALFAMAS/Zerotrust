import { and, eq, sql } from "drizzle-orm";
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

/** False when an optimistic-lock version check fails. */
export type SubscriptionMutationResult = boolean;

type DbClient = ReturnType<typeof getDb>;

async function updateSubscriptionRow(
  subscriptionId: string,
  set: Record<string, unknown>,
  expectedVersion?: number,
  tx?: DbClient
): Promise<SubscriptionMutationResult> {
  const db = tx ?? getDb();
  const patch = {
    ...set,
    updatedAt: new Date(),
    version: sql`${subscriptionsTable.version} + 1`,
  };

  if (expectedVersion !== undefined) {
    const [row] = await db
      .update(subscriptionsTable)
      .set(patch)
      .where(
        and(
          eq(subscriptionsTable.id, subscriptionId),
          eq(subscriptionsTable.version, expectedVersion)
        )
      )
      .returning({ id: subscriptionsTable.id });
    return Boolean(row);
  }

  await db.update(subscriptionsTable).set(patch).where(eq(subscriptionsTable.id, subscriptionId));
  return true;
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
        set: {
          ...values,
          updatedAt: new Date(),
          version: sql`${subscriptionsTable.version} + 1`,
        },
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
      .set({
        ...input,
        updatedAt: new Date(),
        version: sql`${subscriptionsTable.version} + 1`,
      })
      .where(eq(subscriptionsTable.stripeSubscriptionId, input.stripeSubscriptionId));
  });
}

export async function setSubscriptionPaused(input: {
  subscriptionId: string;
  userId: string;
  reason?: unknown;
  expectedVersion?: number;
}): Promise<SubscriptionMutationResult> {
  return getDb().transaction(async (tx) =>
    updateSubscriptionRow(input.subscriptionId, { status: "paused" }, input.expectedVersion, tx)
  );
}

export async function scheduleSubscriptionCancellation(input: {
  subscriptionId: string;
  userId: string;
  reason?: unknown;
  expectedVersion?: number;
}): Promise<SubscriptionMutationResult> {
  return getDb().transaction(async (tx) =>
    updateSubscriptionRow(
      input.subscriptionId,
      { cancelAtPeriodEnd: true },
      input.expectedVersion,
      tx
    )
  );
}

export async function reactivateSubscription(input: {
  subscriptionId: string;
  expectedVersion?: number;
}): Promise<SubscriptionMutationResult> {
  return getDb().transaction(async (tx) =>
    updateSubscriptionRow(
      input.subscriptionId,
      { cancelAtPeriodEnd: false, status: "active" },
      input.expectedVersion,
      tx
    )
  );
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
      .set({
        status: "past_due",
        metadata,
        updatedAt: new Date(),
        version: sql`${subscriptionsTable.version} + 1`,
      })
      .where(eq(subscriptionsTable.id, input.subscriptionId));
  });
}

export async function clearSubscriptionDunning(input: { subscriptionId: string }): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptionsTable)
      .set({
        status: "active",
        metadata: {},
        updatedAt: new Date(),
        version: sql`${subscriptionsTable.version} + 1`,
      })
      .where(eq(subscriptionsTable.id, input.subscriptionId));
  });
}
