/**
 * Org-level session & device policy (P1).
 *
 * Org admins set limits in `org_security_policies`; this service computes the
 * *effective* policy for a user (the strictest across every org they belong to)
 * and evaluates a session against it. Enforced from the auth middleware, so the
 * effective policy is cached per-user with a short TTL to keep the hot path cheap
 * and only does real work when an org has actually configured a limit.
 *
 * Trusted-device list is intentionally out of scope for this slice (needs a
 * device-enrolment flow); the numeric limits + geo allowlist land here.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index";
import { organizationMembersTable, orgSecurityPoliciesTable, sessionsTable } from "../../db/schema";
import { getLogger } from "../../logger/index";
import { revokeSession } from "../../middleware/sessionControl";

const logger = getLogger("session-policy");

export interface EffectiveSessionPolicy {
  maxSessionAgeSeconds: number; // 0 = unlimited
  idleTimeoutSeconds: number; // 0 = unlimited
  maxConcurrentSessions: number; // 0 = unlimited
  countryLists: string[][]; // per-org non-empty allowlists; session must match each
}

const EMPTY_POLICY: EffectiveSessionPolicy = {
  maxSessionAgeSeconds: 0,
  idleTimeoutSeconds: 0,
  maxConcurrentSessions: 0,
  countryLists: [],
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { policy: EffectiveSessionPolicy; expires: number }>();
// `now` is injected so the cache is testable without a real clock.
const minNonZero = (a: number, b: number) => (a === 0 ? b : b === 0 ? a : Math.min(a, b));

/** Drop cached policies (call after any org policy write). */
export function clearSessionPolicyCache(): void {
  cache.clear();
}

export async function getEffectiveSessionPolicy(
  userId: string,
  now = Date.now()
): Promise<EffectiveSessionPolicy> {
  const cached = cache.get(userId);
  if (cached && cached.expires > now) return cached.policy;

  const db = getDb();
  const rows = await db
    .select({
      maxSessionAgeSeconds: orgSecurityPoliciesTable.maxSessionAgeSeconds,
      idleTimeoutSeconds: orgSecurityPoliciesTable.idleTimeoutSeconds,
      maxConcurrentSessions: orgSecurityPoliciesTable.maxConcurrentSessions,
      allowedCountries: orgSecurityPoliciesTable.allowedCountries,
    })
    .from(organizationMembersTable)
    .innerJoin(
      orgSecurityPoliciesTable,
      eq(organizationMembersTable.orgId, orgSecurityPoliciesTable.orgId)
    )
    .where(eq(organizationMembersTable.userId, userId));

  const policy: EffectiveSessionPolicy = { ...EMPTY_POLICY, countryLists: [] };
  for (const r of rows) {
    policy.maxSessionAgeSeconds = minNonZero(
      policy.maxSessionAgeSeconds,
      r.maxSessionAgeSeconds ?? 0
    );
    policy.idleTimeoutSeconds = minNonZero(policy.idleTimeoutSeconds, r.idleTimeoutSeconds ?? 0);
    policy.maxConcurrentSessions = minNonZero(
      policy.maxConcurrentSessions,
      r.maxConcurrentSessions ?? 0
    );
    if (Array.isArray(r.allowedCountries) && r.allowedCountries.length > 0) {
      policy.countryLists.push(r.allowedCountries);
    }
  }

  cache.set(userId, { policy, expires: now + CACHE_TTL_MS });
  return policy;
}

export type SessionPolicyDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "SESSION_MAX_AGE" | "SESSION_IDLE_TIMEOUT" | "SESSION_COUNTRY_BLOCKED";
    };

interface SessionForEval {
  createdAt: Date | string;
  lastActivityAt: Date | string;
  country?: string | null;
}

/** Pure time/geo evaluation — no DB. Concurrent-session cap is handled separately. */
export function evaluateSessionPolicy(
  session: SessionForEval,
  policy: EffectiveSessionPolicy,
  now = Date.now()
): SessionPolicyDecision {
  if (policy.maxSessionAgeSeconds > 0) {
    const age = now - new Date(session.createdAt).getTime();
    if (age > policy.maxSessionAgeSeconds * 1000)
      return { allowed: false, reason: "SESSION_MAX_AGE" };
  }
  if (policy.idleTimeoutSeconds > 0) {
    const idle = now - new Date(session.lastActivityAt).getTime();
    if (idle > policy.idleTimeoutSeconds * 1000)
      return { allowed: false, reason: "SESSION_IDLE_TIMEOUT" };
  }
  // Geo allowlist: only enforced when the session has a known country (avoids
  // locking users out when geo lookup is unavailable). Must satisfy every org.
  if (policy.countryLists.length > 0 && session.country) {
    for (const list of policy.countryLists) {
      if (!list.includes(session.country))
        return { allowed: false, reason: "SESSION_COUNTRY_BLOCKED" };
    }
  }
  return { allowed: true };
}

/**
 * Enforce the concurrent-session cap: keep the `cap` most-recently-active
 * sessions and revoke the rest. Returns true if the *current* session was the
 * one revoked (caller should reject the request).
 */
export async function enforceConcurrentSessionCap(
  userId: string,
  cap: number,
  currentSessionId: string
): Promise<boolean> {
  if (cap <= 0) return false;
  const db = getDb();
  const active = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), eq(sessionsTable.isActive, true)))
    .orderBy(desc(sessionsTable.lastActivityAt));

  if (active.length <= cap) return false;

  const toRevoke = active.slice(cap).map((s) => s.id);
  await Promise.all(
    toRevoke.map((id) => revokeSession(id, "SESSION_CONCURRENT_LIMIT").catch(() => {}))
  );
  if (toRevoke.includes(currentSessionId)) {
    logger.info("Current session revoked by concurrent-session cap", { userId, currentSessionId });
    return true;
  }
  return false;
}
