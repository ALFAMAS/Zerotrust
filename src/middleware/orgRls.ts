import { createMiddleware } from "hono/factory";
import { shouldBypassOrgRlsFromContext, verifyOrgMembership } from "../db/resolveOrgContext";
import { withOrgRls } from "../db/rls";
import type { HonoEnv } from "../shared/types";

export interface OrgRlsMiddlewareOptions {
  /** Also read `orgId` from the query string (billing routes). */
  allowQueryOrg?: boolean;
}

/**
 * Pool-safe per-request Postgres RLS context.
 *
 * Reads active org from `authMiddleware` (`activeOrgId` on session). Handlers may
 * use `c.get("dbTx")` when present; otherwise existing store/repository helpers
 * set context themselves.
 *
 * When `app.org_id` is unset, migration policies are permissive (workers,
 * migrations, multi-org list paths). Platform admin / support `?all=true`
 * sets `app.rls_bypass`.
 */
export function orgRlsMiddleware(opts: OrgRlsMiddlewareOptions = {}) {
  void opts;
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user?.id) return next();

    if (shouldBypassOrgRlsFromContext(c, user)) {
      return withOrgRls({ bypass: true, userId: user.id }, async (tx) => {
        c.set("dbTx", tx);
        await next();
      });
    }

    const orgId = c.get("activeOrgId");
    if (!orgId) return next();

    if (!(await verifyOrgMembership(orgId, user.id, user))) {
      return c.json(
        { error: "ORG_ACCESS_DENIED", message: "Not a member of this organization" },
        403
      );
    }

    return withOrgRls({ orgId, userId: user.id }, async (tx) => {
      c.set("dbTx", tx);
      await next();
    });
  });
}
