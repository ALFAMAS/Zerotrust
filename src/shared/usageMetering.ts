/**
 * Usage metering primitives — shared between the API key auth middleware
 * (hot-path quota enforcement) and the billing usage service (dashboard
 * summaries). Extracted from src/services/billing/usage.service.ts so that
 * apiKeyAuth (shared domain) doesn't need to import from billing.
 *
 * Only depends on db/schema/logger — all shared-domain modules.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, getReadDb } from "../db/index";
import { usageCountersTable } from "../db/schema";
import { getLogger } from "../logger/index";

const logger = getLogger("usage");

export type UsageMetric = "api_calls" | "seats" | "storage_bytes" | `api_key:${string}:api_calls`;

export function apiKeyUsageMetric(apiKeyId: string): UsageMetric {
  return `api_key:${apiKeyId}:api_calls`;
}

/** Current billing period bucket: "YYYY-MM". */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface UsageScope {
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
  const db = getReadDb();
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
