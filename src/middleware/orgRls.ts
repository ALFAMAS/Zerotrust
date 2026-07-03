import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db";
import { withOrgRls } from "../db/rls";
import { organizationMembersTable } from "../db/schema";
import { isAdmin } from "../shared/roles";
import type { HonoEnv } from "../shared/types";

/**
 * Optional org context for RLS-backed routes.
 *
 * Reads `X-Org-Id`, verifies membership (or platform admin), stores
 * `activeOrgId` on the Hono context, and runs the handler inside a transaction
 * with `app.org_id` set. Handlers on these routes must use the transaction
 * passed via `c.get("dbTx")` — see webhook store helpers.
 */
export function orgRlsMiddleware() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const orgId = c.req.header("x-org-id")?.trim();
    if (!orgId) return next();

    const user = c.get("user");
    if (!user?.id) return next();

    if (!isAdmin(user)) {
      const db = getDb();
      const [member] = await db
        .select({ id: organizationMembersTable.id })
        .from(organizationMembersTable)
        .where(
          and(
            eq(organizationMembersTable.orgId, orgId),
            eq(organizationMembersTable.userId, user.id)
          )
        )
        .limit(1);
      if (!member) {
        return c.json({ error: "ORG_ACCESS_DENIED", message: "Not a member of this organization" }, 403);
      }
    }

    c.set("activeOrgId", orgId);

    return withOrgRls({ orgId, userId: user.id }, async (tx) => {
      c.set("dbTx", tx);
      await next();
    });
  });
}
