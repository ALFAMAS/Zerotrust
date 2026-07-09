import { eq } from "drizzle-orm";
import { getReadDb } from "../../db";
import { organizationMembersTable } from "../../db/schema";

/** Org IDs the user belongs to — used to scope webhook admin routes. */
export async function getUserOrgIds(userId: string): Promise<string[]> {
  const db = getReadDb();
  const rows = await db
    .select({ orgId: organizationMembersTable.orgId })
    .from(organizationMembersTable)
    .where(eq(organizationMembersTable.userId, userId));
  return rows.map((r) => r.orgId);
}

/**
 * Pick the org to attach a new webhook to. Never trusts client-supplied tenantId.
 * When the user belongs to multiple orgs, an explicit orgId in the body is required.
 */
export async function resolveOrgForWebhookCreate(
  userId: string,
  requestedOrgId?: string
): Promise<{ orgId: string } | { error: "NO_ORG" | "ORG_REQUIRED" | "FORBIDDEN" }> {
  const orgIds = await getUserOrgIds(userId);
  if (orgIds.length === 0) return { error: "NO_ORG" };

  if (requestedOrgId) {
    return orgIds.includes(requestedOrgId) ? { orgId: requestedOrgId } : { error: "FORBIDDEN" };
  }

  if (orgIds.length === 1) return { orgId: orgIds[0]! };
  return { error: "ORG_REQUIRED" };
}
