"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearSessionPolicyCache = clearSessionPolicyCache;
exports.getEffectiveSessionPolicy = getEffectiveSessionPolicy;
exports.evaluateSessionPolicy = evaluateSessionPolicy;
exports.enforceConcurrentSessionCap = enforceConcurrentSessionCap;
const drizzle_orm_1 = require("drizzle-orm");
const index_1 = require("../../db/index");
const schema_1 = require("../../db/schema");
const index_2 = require("../../logger/index");
const sessionControl_1 = require("../../middleware/sessionControl");
const logger = (0, index_2.getLogger)("session-policy");
const EMPTY_POLICY = {
    maxSessionAgeSeconds: 0,
    idleTimeoutSeconds: 0,
    maxConcurrentSessions: 0,
    countryLists: [],
};
const CACHE_TTL_MS = 60000;
const cache = new Map();
// `now` is injected so the cache is testable without a real clock.
const minNonZero = (a, b) => (a === 0 ? b : b === 0 ? a : Math.min(a, b));
/** Drop cached policies (call after any org policy write). */
function clearSessionPolicyCache() {
    cache.clear();
}
async function getEffectiveSessionPolicy(userId, now = Date.now()) {
    const cached = cache.get(userId);
    if (cached && cached.expires > now)
        return cached.policy;
    const db = (0, index_1.getDb)();
    const rows = await db
        .select({
        maxSessionAgeSeconds: schema_1.orgSecurityPoliciesTable.maxSessionAgeSeconds,
        idleTimeoutSeconds: schema_1.orgSecurityPoliciesTable.idleTimeoutSeconds,
        maxConcurrentSessions: schema_1.orgSecurityPoliciesTable.maxConcurrentSessions,
        allowedCountries: schema_1.orgSecurityPoliciesTable.allowedCountries,
    })
        .from(schema_1.organizationMembersTable)
        .innerJoin(schema_1.orgSecurityPoliciesTable, (0, drizzle_orm_1.eq)(schema_1.organizationMembersTable.orgId, schema_1.orgSecurityPoliciesTable.orgId))
        .where((0, drizzle_orm_1.eq)(schema_1.organizationMembersTable.userId, userId));
    const policy = { ...EMPTY_POLICY, countryLists: [] };
    for (const r of rows) {
        policy.maxSessionAgeSeconds = minNonZero(policy.maxSessionAgeSeconds, r.maxSessionAgeSeconds ?? 0);
        policy.idleTimeoutSeconds = minNonZero(policy.idleTimeoutSeconds, r.idleTimeoutSeconds ?? 0);
        policy.maxConcurrentSessions = minNonZero(policy.maxConcurrentSessions, r.maxConcurrentSessions ?? 0);
        if (Array.isArray(r.allowedCountries) && r.allowedCountries.length > 0) {
            policy.countryLists.push(r.allowedCountries);
        }
    }
    cache.set(userId, { policy, expires: now + CACHE_TTL_MS });
    return policy;
}
/** Pure time/geo evaluation — no DB. Concurrent-session cap is handled separately. */
function evaluateSessionPolicy(session, policy, now = Date.now()) {
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
async function enforceConcurrentSessionCap(userId, cap, currentSessionId) {
    if (cap <= 0)
        return false;
    const db = (0, index_1.getDb)();
    const active = await db
        .select({ id: schema_1.sessionsTable.id })
        .from(schema_1.sessionsTable)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sessionsTable.userId, userId), (0, drizzle_orm_1.eq)(schema_1.sessionsTable.isActive, true)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.sessionsTable.lastActivityAt));
    if (active.length <= cap)
        return false;
    const toRevoke = active.slice(cap).map((s) => s.id);
    await Promise.all(toRevoke.map((id) => (0, sessionControl_1.revokeSession)(id, "SESSION_CONCURRENT_LIMIT").catch(() => { })));
    if (toRevoke.includes(currentSessionId)) {
        logger.info("Current session revoked by concurrent-session cap", { userId, currentSessionId });
        return true;
    }
    return false;
}
//# sourceMappingURL=sessionPolicy.service.js.map