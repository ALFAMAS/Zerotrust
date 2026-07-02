/**
 * Usage counters — tracks metered usage (API calls, seats, storage) per
 * billing period (calendar month) against plan limits.
 *
 * The core metering primitives (incrementUsage, getUsage, apiKeyUsageMetric,
 * currentPeriod) live in src/shared/usageMetering.ts so the apiKeyAuth
 * middleware (shared domain) can use them without importing from billing.
 * This module re-exports them and adds the dashboard-facing getUsageSummary.
 */

import { eq } from "drizzle-orm";
import { getReadDb } from "../../db/index";
import { organizationMembersTable, subscriptionsTable } from "../../db/schema";
import { type Plan, planLimit } from "../../shared/plans";
import {
  type UsageMetric,
  apiKeyUsageMetric,
  currentPeriod,
  getUsage,
  incrementUsage,
  type UsageScope,
} from "../../shared/usageMetering";

export {
  type UsageMetric,
  apiKeyUsageMetric,
  currentPeriod,
  getUsage,
  incrementUsage,
  type UsageScope,
};

export interface UsageSummary {
  period: string;
  metrics: Record<string, { used: number; limit: number }>;
}

/** Usage summary for the dashboard: every metric with its plan limit. */
export async function getUsageSummary(scope: UsageScope): Promise<UsageSummary> {
  const db = getReadDb();

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
