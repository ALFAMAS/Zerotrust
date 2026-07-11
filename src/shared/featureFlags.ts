/**
 * Org-scoped feature flags with optional percentage rollout.
 */

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getReadDb } from "../db";
import { orgFeatureFlagsTable } from "../db/schema";

export interface FeatureFlagRow {
  key: string;
  enabled: boolean;
  rolloutPercent: number;
  metadata: Record<string, unknown>;
}

function bucketForUser(orgId: string, key: string, userId: string): number {
  const hash = createHash("sha256").update(`${orgId}:${key}:${userId}`).digest();
  return hash[0]! % 100;
}

export async function getOrgFeatureFlag(
  orgId: string,
  key: string
): Promise<FeatureFlagRow | null> {
  const db = getReadDb();
  const [row] = await db
    .select()
    .from(orgFeatureFlagsTable)
    .where(and(eq(orgFeatureFlagsTable.orgId, orgId), eq(orgFeatureFlagsTable.key, key)))
    .limit(1);
  if (!row) return null;
  return {
    key: row.key,
    enabled: row.enabled,
    rolloutPercent: row.rolloutPercent,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export async function listOrgFeatureFlags(orgId: string): Promise<FeatureFlagRow[]> {
  const db = getReadDb();
  const rows = await db
    .select()
    .from(orgFeatureFlagsTable)
    .where(eq(orgFeatureFlagsTable.orgId, orgId));
  return rows.map((row) => ({
    key: row.key,
    enabled: row.enabled,
    rolloutPercent: row.rolloutPercent,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  }));
}

/**
 * Returns true when the flag is enabled for the org (and user bucket when userId given).
 * Missing flags default to false (fail-closed).
 */
export async function isFeatureEnabled(
  orgId: string,
  key: string,
  userId?: string
): Promise<boolean> {
  const flag = await getOrgFeatureFlag(orgId, key);
  if (!flag || !flag.enabled) return false;
  if (flag.rolloutPercent >= 100) return true;
  if (flag.rolloutPercent <= 0) return false;
  if (!userId) return true;
  return bucketForUser(orgId, key, userId) < flag.rolloutPercent;
}
