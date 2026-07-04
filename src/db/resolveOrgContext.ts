import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { getDb } from "./index";
import { organizationMembersTable } from "./schema";
import { hasAnyRole, isAdmin } from "../shared/roles";
import type { HonoEnv, User } from "../shared/types";

/** Resolve org id from `X-Org-Id` header or `orgId` query param. */
export function orgIdFromRequest(c: Context<HonoEnv>, allowQuery = false): string | undefined {
  const header = c.req.header("x-org-id")?.trim();
  if (header) return header;
  if (allowQuery) return c.req.query("orgId")?.trim() || undefined;
  return undefined;
}

/** Whether the principal may bypass org-scoped RLS (platform admin / support agent views). */
export function shouldBypassOrgRls(c: Context<HonoEnv>, user: User): boolean {
  if (c.req.query("all") === "true" && (isAdmin(user) || hasAnyRole(user, ["support"]))) {
    return true;
  }
  return false;
}

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

/**
 * Validate and store active org on the Hono context (from `authMiddleware`).
 * Postgres `app.org_id` is set later by `orgRlsMiddleware` inside a transaction.
 */
export async function resolveAndSetActiveOrg(
  c: Context<HonoEnv>,
  user: User,
  opts?: { allowQuery?: boolean }
): Promise<void> {
  const orgId = orgIdFromRequest(c, opts?.allowQuery);
  if (!orgId) return;
  if (!(await verifyOrgMembership(orgId, user.id, user))) return;
  c.set("activeOrgId", orgId);
}
