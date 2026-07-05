import { and, eq } from "drizzle-orm";
import { hasAnyRole, isAdmin } from "../shared/roles";
import type { User } from "../shared/types";
import { getDb } from "./index";
import { organizationMembersTable } from "./schema";

/** Verify org membership; platform admins always pass. */
export async function verifyOrgMembership(
  orgId: string,
  userId: string,
  user: User
): Promise<boolean> {
  if (isAdmin(user)) return true;
  const db = getDb();
  const [member] = await db
    .select({ id: organizationMembersTable.id })
    .from(organizationMembersTable)
    .where(
      and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
    )
    .limit(1);
  return Boolean(member);
}

/** Whether the principal may bypass org-scoped RLS (platform admin / support agent views). */
export function shouldBypassOrgRls(user: User, queryAll: string | undefined): boolean {
  if (queryAll === "true" && (isAdmin(user) || hasAnyRole(user, ["support"]))) {
    return true;
  }
  return false;
}
