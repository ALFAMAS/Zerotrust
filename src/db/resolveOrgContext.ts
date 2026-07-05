import type { Context } from "hono";
import type { HonoEnv, User } from "../shared/types";
import { shouldBypassOrgRls, verifyOrgMembership } from "./orgMembership";
import { setSessionActiveOrg } from "./repositories/authSessions.repository";

export interface SessionOrgContext {
  id: string;
  activeOrgId?: string | null;
}

/**
 * Client-supplied org hints (path, query, `X-Org-Id`). Never authoritative on
 * their own — used only to bootstrap `sessions.active_org_id` when unset.
 */
export function orgIdHintFromRequest(c: Context<HonoEnv>, allowQuery = false): string | undefined {
  const pathParam = c.req.param("orgId")?.trim();
  if (pathParam) return pathParam;
  if (allowQuery) {
    const queryOrg = c.req.query("orgId")?.trim();
    if (queryOrg) return queryOrg;
  }
  const header = c.req.header("x-org-id")?.trim();
  if (header) return header;
  return undefined;
}

/** @deprecated Use `orgIdHintFromRequest` — kept for path/query-only callers. */
export function orgIdFromRequest(c: Context<HonoEnv>, allowQuery = false): string | undefined {
  return orgIdHintFromRequest(c, allowQuery);
}

export { shouldBypassOrgRls, verifyOrgMembership } from "./orgMembership";

/** Context-aware wrapper for `shouldBypassOrgRls`. */
export function shouldBypassOrgRlsFromContext(c: Context<HonoEnv>, user: User): boolean {
  return shouldBypassOrgRls(user, c.req.query("all"));
}

/**
 * Resolve active org from the session row (authoritative). When the session has
 * no `activeOrgId`, a validated client hint may bootstrap and persist it.
 * Postgres `app.org_id` is set later by `orgRlsMiddleware` inside a transaction.
 */
export async function resolveAndSetActiveOrg(
  c: Context<HonoEnv>,
  user: User,
  session: SessionOrgContext,
  opts?: { allowQuery?: boolean }
): Promise<void> {
  if (session.activeOrgId) {
    if (await verifyOrgMembership(session.activeOrgId, user.id, user)) {
      c.set("activeOrgId", session.activeOrgId);
      return;
    }
    await setSessionActiveOrg({ sessionId: session.id, orgId: null, userId: user.id, user });
    return;
  }

  const hint = orgIdHintFromRequest(c, opts?.allowQuery);
  if (!hint) return;
  if (!(await verifyOrgMembership(hint, user.id, user))) return;

  const updated = await setSessionActiveOrg({
    sessionId: session.id,
    orgId: hint,
    userId: user.id,
    user,
  });
  if (updated) c.set("activeOrgId", hint);
}
