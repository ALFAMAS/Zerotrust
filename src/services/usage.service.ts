/**
 * Usage counters — tracks metered usage (API calls, seats, storage) per
 * billing period (calendar month) against plan limits.
 */

import { eq, and, sql, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { usageCountersTable, organizationMembersTable, subscriptionsTable } from "../db/schema";
import { planLimit, type Plan } from "../shared/plans";
import { getLogger } from "../logger";

const logger = getLogger("usage");

export type UsageMetric = "api_calls" | "seats" | "storage_bytes";

/** Current billing period bucket: "YYYY-MM". */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface UsageScope {
  userId?: string;
  orgId?: string;
}

/** Increment a usage counter (upsert). Fire-and-forget safe. */
export async function incrementUsage(
  metric: UsageMetric,
  scope: UsageScope,
  by = 1
): Promise<void> {
  if (!scope.userId && !scope.orgId) return;
  try {
    const db = getDb();
    const period = currentPeriod();
    await db
      .insert(usageCountersTable)
      .values({
        userId: scope.userId ?? null,
        orgId: scope.orgId ?? null,
        period,
        metric,
        value: by,
      })
      .onConflictDoUpdate({
        target: [
          usageCountersTable.userId,
          usageCountersTable.orgId,
          usageCountersTable.period,
          usageCountersTable.metric,
        ],
        set: {
          value: sql`${usageCountersTable.value} + ${by}`,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    logger.error("Failed to increment usage counter", err as Error);
  }
}

/** Read a single usage counter for the current period. */
export async function getUsage(metric: UsageMetric, scope: UsageScope): Promise<number> {
  const db = getDb();
  const period = currentPeriod();
  const conditions = [eq(usageCountersTable.period, period), eq(usageCountersTable.metric, metric)];
  conditions.push(
    scope.userId ? eq(usageCountersTable.userId, scope.userId) : isNull(usageCountersTable.userId)
  );
  conditions.push(
    scope.orgId ? eq(usageCountersTable.orgId, scope.orgId) : isNull(usageCountersTable.orgId)
  );

  const [row] = await db
    .select({ value: usageCountersTable.value })
    .from(usageCountersTable)
    .where(and(...conditions))
    .limit(1);
  return row?.value ?? 0;
}

export interface UsageSummary {
  period: string;
  metrics: Record<string, { used: number; limit: number }>;
}

/** Usage summary for the dashboard: every metric with its plan limit. */
export async function getUsageSummary(scope: UsageScope): Promise<UsageSummary> {
  const db = getDb();

  // Resolve the plan for limits
  let plan: Plan = "free";
  if (scope.orgId) {
    const [sub] = await db
      .select({ plan: subscriptionsTable.plan })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.orgId, scope.orgId))
      .limit(1);
    if (sub) plan = sub.plan as Plan;
  } else if (scope.userId) {
    const [sub] = await db
      .select({ plan: subscriptionsTable.plan })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, scope.userId))
      .limit(1);
    if (sub) plan = sub.plan as Plan;
  }

  const apiCalls = await getUsage("api_calls", scope);

  // Seats = live member count when scoped to an org
  let seats = 0;
  if (scope.orgId) {
    const members = await db
      .select({ id: organizationMembersTable.id })
      .from(organizationMembersTable)
      .where(eq(organizationMembersTable.orgId, scope.orgId));
    seats = members.length;
  }

  const storage = await getUsage("storage_bytes", scope);

  return {
    period: currentPeriod(),
    metrics: {
      api_calls: { used: apiCalls, limit: planLimit(plan, "apiCallsPerMonth") },
      seats: { used: seats, limit: planLimit(plan, "orgMembers") },
      storage_bytes: { used: storage, limit: planLimit(plan, "storageBytes") },
    },
  };
}
