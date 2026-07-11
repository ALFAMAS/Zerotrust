/**
 * Org-scoped feature flags with optional percentage rollout.
 */

import { featureFlagsRepo } from "../db/repositories/featureFlags.repository";

export type { FeatureFlagRow } from "../db/repositories/featureFlags.repository";

export async function getOrgFeatureFlag(orgId: string, key: string) {
  return featureFlagsRepo(orgId).get(key);
}

export async function listOrgFeatureFlags(orgId: string) {
  return featureFlagsRepo(orgId).list();
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
  return featureFlagsRepo(orgId).isEnabled(key, userId);
}
