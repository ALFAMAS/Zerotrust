# zerotrust — Zero Trust SaaS Starter: Senior Technical & Security Audit

**Date:** 2026-07-03
**Scope:** `src/` (Hono API), `packages/ui/` (Next.js), `src/db` schema, middleware,
services, repositories, config, and deployment docs.
**Method:** Static code review of the actual codebase (not the marketing docs). Every
finding cites a concrete file/line. Where the repo's own docs claim a control is
"shipped," this audit verifies whether the *code path* actually enforces it.

> **Framing.** The pre-existing `AUDIT-REPORT.md` / `todo.md` declare the backlog
> "empty" and all controls shipped. This review deliberately re-derives from source
> and finds that several load-bearing controls are **present but not wired into the
> paths that need them** (audit log, secret enforcement) and that at least one
> auth flow (password reset) is **missing a control it needs**. Treat the "all
> green" status docs with skepticism.

---

## Executive summary

zerotrust is a genuinely strong auth foundation: PASETO v4 tokens, refresh-token
rotation with reuse detection and family revocation, Stripe webhook idempotency,
a conditional-update wallet spend path, transactional repositories for the money
and org-ownership paths, a global XSS sanitizer, and centralized `safeFetch`/
`safeRedirect` helpers. The CWE-hardening discipline in `CLAUDE.md` is real and
mostly holds in code.

The problems are not in the primitives — they are in **wiring and fail-safes**:

| # | Severity | Finding |
|---|----------|---------|
| 1 | **Critical** | Password-reset OTP is brute-forceable: no rate limit on the route, no attempt counter, 6-digit code |
| 2 | **Critical** | The "tamper-evident audit log" is bypassed by the sensitive events; core admin mutations write no audit at all |
| 3 | **High** | `TOKEN_SECRET_HEX` / `CSFLE_MASTER_KEY_HEX` silently auto-generate when unset — prod can boot with ephemeral keys (token failures across replicas; CSFLE data loss on restart) |
| 4 | **High** | No "last admin" / self-lockout protection on system-admin role and user delete/suspend |
| 5 | **High** | Admin security-settings changes are unvalidated and unaudited (`updateSettings` spreads raw body) |
| 6 | Medium | `topUpWallet` is read-modify-write → lost top-ups under concurrency (money path) |
| 7 | Medium | Retention purge ignores `legalHold` and full-scans the users table |
| 8 | Medium | No optimistic locking / version fields → concurrent-edit lost updates |
| 9 | Medium | Vestigial multi-tenant layer (`tenants`, `resolveTenant`, `X-Tenant-ID`) is never mounted; tenant rate-limit trusts an unauthenticated header |
| 10 | Medium | Hardcoded Neon DB host as a fallback `DATABASE_URL`; app fails *open* to it |
| 11 | Medium | Missing indexes on `otps` and `audit_logs(actor_id)` for growth/hot paths |
| 12 | Medium | Password reset doesn't revoke existing sessions on success |
| 13 | Medium | Authorization checks read the **replica** (`getReadDb`) → lag can authorize a just-removed member |
| 14–17 | Low | CORS reflect-any in non-prod, avatar upload unthrottled, impersonation delegation not chained, secret-doc drift |

The two Criticals are both exploitable/blocking for a real SaaS launch. Fix them
first; they are small, localized changes.

---

## 1. Architecture review

**Shape.** Modular monolith: one Hono API (`src/api/server.ts`, ~27 route modules)
+ Next.js UI + Postgres (Drizzle, 41 tables) + Redis (sessions/rate-limit/BullMQ)
+ a dedicated worker (`src/worker.ts`). Domains call in-process. This is the right
architecture for this stage — no premature microservices, clear module boundaries,
a real repository layer emerging under `src/db/repositories/`.

**What's good and should be kept:**

- **Repository layer for invariant-bearing writes** (`orgs`, `wallet`, `authSessions`,
  `stripeEvents`) — each owns its transaction. `createOrganizationWithOwner`,
  `transferOrganizationOwnership`, and `acceptOrgInvite` are correctly atomic and
  idempotent (`onConflictDoNothing` on membership). This pattern is exactly right;
  extend it, don't dilute it.
- **Background topology** is deliberate: API replicas run `WORKER_MODE=true`, one
  worker owns the BullMQ schedulers, Stripe webhook producer stays on the API.
- **Shared helpers** (`pagination`, `dbCount`, `httpErrors`, `safeFetch`,
  `safeRedirect`, `cryptoHash`, `roles`) genuinely reduce drift.

**Architecture-level weaknesses (detailed as findings #2, #9 below):**

1. **Two audit writers with near-identical names** — `auditLog()` in
   `src/logger/index.ts` (logs + optional SIEM/ES) and `insertAuditLog()` in
   `src/audit/chain.ts` (the real hash-chained DB writer). They are trivially
   confused, and in practice the *sensitive* call sites picked the wrong one. This
   is an architecture smell that produced a Critical (see §2, finding 2).
2. **The multi-tenant story is bifurcated.** There is a full `tenants` table + SSO
   config + `resolveTenant()`/`requireTenant()` middleware + `X-Tenant-ID`/subdomain
   resolution … none of which is mounted in `server.ts`. The *actual* tenant
   boundary is `organizations` + `organization_members`. So the codebase implies
   two isolation models but enforces only one. Decide, document, and delete or wire
   the other (finding 9).
3. **Org authorization is hand-rolled per route.** `org.routes.ts` defines local
   `requireMember`/`requireAdmin`/`requireOwner` helpers and never uses the shared
   `hasOrgPermission()` from `src/shared/permissions.ts`. The permission model
   exists but the routes bypass it with coarse role string checks. Centralize a
   `requireOrgPermission(orgId, permission)` guard so the fine-grained permission
   set is the single source of truth.

**Recommended structural upgrades:** unify the audit writer (one function that
persists to the chain *and* fans out to SIEM); introduce an org-permission
middleware; move all request-body parsing to shared Zod schemas (several handlers
still use `as` casts — see §8).

---

## 2. Zero Trust security findings

### 🔴 Critical 1 — Password-reset OTP is brute-forceable (account takeover)

- **Problem.** `POST /auth/password-reset/request` and `/confirm` are mounted with
  **no rate limiter** (`server.ts:147` → `app.route("/auth/password-reset", …)`;
  every other auth route carries `rateLimit(...)`, this one does not). The reset
  code is a **6-digit numeric OTP** (`crypto.randomInt(100000, 999999)`,
  `password-reset.routes.ts:39`) valid for 15 minutes. The `/confirm` handler
  (`password-reset.routes.ts:76–162`) looks up the OTP by exact code but **never
  reads or increments `otps.attempts`** — the column exists in the schema
  (`schema.ts:264`) and is simply unused here.
- **Risk.** ~900k candidate codes, 15-minute window, no per-account attempt cap and
  no per-IP/route throttle → an attacker who knows a victim's email can enumerate
  the code with concurrent requests and take over any account. `/request` being
  unthrottled additionally allows OTP flooding / email-bomb of arbitrary addresses.
- **Missing failsafe.** (a) route-level rate limit, (b) per-OTP attempt counter with
  lockout, (c) per-account reset-request throttle.
- **Suggested fix.**
  ```ts
  // password-reset.routes.ts
  router.post("/request", rateLimit({ points: 3, windowSecs: 3600 }), /* per IP */ …);
  router.post("/confirm", rateLimit({ points: 5, windowSecs: 900 }), async (c) => {
    // after fetching the OTP row:
    if (otp.attempts >= 5) return c.json({ error: "TOO_MANY_ATTEMPTS" }, 429);
    // on any mismatch, atomically bump attempts and, when the threshold trips,
    // invalidate the OTP:
    await db.update(otpsTable).set({ attempts: sql`${otpsTable.attempts} + 1` })
      .where(eq(otpsTable.id, otp.id));
  });
  ```
  Prefer a **32+ char random token** over a 6-digit code for password reset (the
  code is delivered by link anyway — `resetUrl` at line 54 — so there is no UX cost).
- **Priority.** Immediate. This is the single highest-risk finding.

### 🔴 Critical 2 — The tamper-evident audit log is bypassed by the events that need it

- **Problem.** Two writers exist. `insertAuditLog()` (`src/audit/chain.ts:95`) is the
  real one: it appends a SHA-256 hash-chained row to `audit_logs` under an advisory
  lock. `auditLog()` (`src/logger/index.ts:280`) only calls `logger.info/warn`,
  fans out to SIEM, and (if enabled) Elasticsearch — **it never touches
  `audit_logs`.** The sensitive operations call the *logger* one:
  - `admin.impersonate` (`admin-tools.routes.ts:90`)
  - `admin.plan_override` (`admin-tools.routes.ts:155`)
  - `admin.broadcast` (`admin-tools.routes.ts:308`)
  - `billing.plan_changed` / `paused` / `cancel_scheduled` / `reactivated`
    (`billing.routes.ts:156/206/218/255`)
  - `security.takeover_flagged` (`accountTakeover.service.ts:127`)

  Meanwhile the **core admin mutations write no audit event at all**:
  `PATCH /admin/users/:id` (suspend), `DELETE /admin/users/:id`,
  `POST /admin/users/:id/roles` (grant **admin**), `DELETE …/roles/:roleName`,
  and `PUT /admin/settings` (toggle MFA/verification/lockout) — none call any audit
  writer (`admin.routes.ts:164–226, 415–487, 46`).
  Only 5 call sites use the real `insertAuditLog()` (continuous-eval, access-review,
  SSF receiver).
- **Risk.** The platform advertises a SOC 2 CC7 "tamper-evident audit log," but the
  highest-value events (privilege grant, impersonation, security-policy change,
  billing manipulation) either land only in ephemeral app logs or are not recorded.
  An attacker (or a rogue admin) can grant themselves `admin`, disable MFA
  enforcement, and impersonate users, leaving **no immutable trail**. This defeats
  the primary compliance value of the feature and breaks incident forensics.
- **Missing failsafe.** A single audit path that always persists to the hash chain
  for security-relevant actions, plus audit calls on the admin user/role/settings
  mutations.
- **Suggested fix.** Make `auditLog()` a thin wrapper that (1) `insertAuditLog(...)`
  into the chain and (2) fans out to SIEM/ES — so *no* call site can accidentally
  pick the non-persisting one. Then add audit calls to every admin mutation:
  ```ts
  // admin.routes.ts — after a successful role grant
  await insertAuditLog({
    action: "admin.role_granted", actorId: admin.id, actorEmail: admin.email,
    targetId: id, targetType: "user", success: true,
    resourceDetails: { role: roleName },
  });
  ```
- **Priority.** Immediate (compliance + forensics blocker).

### 🟠 High 3 — Critical secrets silently auto-generate; prod can boot without them

- **Problem.** `config/index.ts:29–30` sets
  `tokenSecretHex: process.env.TOKEN_SECRET_HEX || generateSecureKey(32)` and the
  same for `csfleMasterKeyHex`. `validateConfig` only checks **length ≥ 64**
  (`:102–108`), which a generated key satisfies — so a missing env var is never
  caught. The production fail-fast block (`:130–168`) enforces `METRICS_AUTH_TOKEN`,
  `CORS_ALLOWED_ORIGINS`, `REDIS_URI`, and backup encryption, but **not** the
  presence-from-env of these two secrets.
- **Risk.**
  - README deploys API replicas with `pm2 … -i max` (cluster). Each process
    generates a *different* ephemeral `tokenSecretHex` → a token signed by replica A
    is rejected by replica B: intermittent, hard-to-diagnose 401s.
  - `csfleMasterKeyHex` regenerating on restart makes **all CSFLE-encrypted columns
    permanently undecryptable** — silent, irreversible data loss.
- **Missing failsafe.** Fail closed in production when either secret is not sourced
  from the environment.
- **Suggested fix.**
  ```ts
  if (process.env.NODE_ENV === "production") {
    if (!process.env.TOKEN_SECRET_HEX) errors.push("TOKEN_SECRET_HEX is required in production");
    if (!process.env.CSFLE_MASTER_KEY_HEX) errors.push("CSFLE_MASTER_KEY_HEX is required in production");
  }
  ```
  Keep the dev auto-gen, but only when `NODE_ENV !== "production"`, and log a loud
  warning that keys are ephemeral.
- **Priority.** Immediate for anyone deploying multi-replica or using CSFLE.

### 🟠 High 4 — No "last admin" / self-lockout protection

- **Problem.** `DELETE /admin/users/:id` (soft-delete), `PATCH /admin/users/:id`
  (status → suspended/deleted), and `DELETE /admin/users/:id/roles/:roleName`
  (`admin.routes.ts:206, 164, 461`) have **no guard** preventing an admin from
  deleting/suspending themselves or removing the **last** system `admin`. (Org
  *owner* removal is guarded in `org.routes.ts:223`, but the system-admin role is
  not.)
- **Risk.** The platform can be left with zero usable admins — an operational
  lockout requiring direct DB surgery to recover. Also a griefing vector between
  co-admins.
- **Missing failsafe.** Count-remaining-admins check before demotion/suspension/
  deletion; block self-suspension of the acting admin.
- **Suggested fix.** Before removing the `admin` role or suspending/deleting a user
  who holds it, `countRows(users where 'admin' = ANY(roles) and status='active')`;
  refuse when the count would drop to 0, and refuse `actorId === targetId` for
  destructive self-actions.
- **Priority.** Short-term (before multi-admin orgs go live).

### 🟠 High 5 — Admin security-settings changes are unvalidated and unaudited

- **Problem.** `PUT /admin/settings` → `updateSettings(body, adminId)`
  (`settings.model.ts`) spreads the **raw request body** into the Drizzle upsert
  with no Zod schema and no value bounds. These settings control
  `requireMfaForAll`, `requireEmailVerification`, `accountLockoutThreshold`,
  `sessionTTLSeconds`, `maxConcurrentSessions`, `registrationEnabled`. There is also
  no audit event (ties to finding 2).
- **Risk.** A compromised/rogue admin can silently weaken platform-wide auth
  (e.g. `requireMfaForAll=false`, `accountLockoutThreshold=0`, enormous session
  TTL) with no bounds checking and no immutable record. Bad values (negative TTL,
  0 threshold) can also degrade the security posture by accident.
- **Missing failsafe.** Zod validation with sane min/max, and an `admin.settings_changed`
  audit event capturing the diff.
- **Suggested fix.** Validate with a schema (`sessionTTLSeconds: z.number().int().min(300).max(86400)`,
  etc.); write a chained audit entry with the before/after of changed keys.
- **Priority.** Short-term.

### Zero-Trust items reviewed and found **sound** (keep as-is)

- **Refresh-token rotation + reuse detection** (`auth.routes.ts:739–840`,
  `authSessions.repository.ts`): rotation is transactional; presenting a revoked
  token triggers `revokeRefreshTokenFamily` (revoke all tokens + sessions). Correct.
- **Stripe webhook**: signature verified against the **raw** body
  (`billing.webhooks.ts:35`), then `claimStripeEvent(event.id)` gives at-least-once
  idempotency; failure `releaseStripeEvent` so retries reprocess. Correct.
- **Session guard** (`middleware/auth.ts`): checks active/expired/revoked, enforces
  org session policy + concurrent caps, rejects `deleted`/`suspended` users.
- **Mass-assignment**: `PATCH /auth/me` uses a whitelist schema that excludes
  `roles`/`status` (`auth.routes.ts:1158–1203`) — no self-privilege-escalation.
- **CORS**: fails **closed** in production when no allowlist is set (`cors.ts`).
- **Input sanitization**, `safeFetch` (SSRF), `safeRedirect` (open-redirect) are
  centralized and mounted.

---

## 3. Failsafe & validation checks (gap table)

| Concern | Enforced? | Evidence / gap |
|---|---|---|
| Cross-tenant (cross-org) data access | ⚠️ Partial | Org routes check membership per handler; **read checks hit the replica** (finding 13). No DB row-level security. |
| Disabled/deleted user still active | ✅ | `authMiddleware` rejects `deleted`/`suspended`; admin delete revokes sessions. |
| Revoked invite still usable | ✅ | `acceptOrgInvite` checks `usedAt`/`expiresAt` in-tx. |
| Duplicate org creation | ✅ | `organizations.slug` unique; create is transactional. |
| Owner removed without replacement | ✅ org / ❌ system-admin | Org owner guarded; **last system admin not** (finding 4). |
| Role escalation | ✅ self / ⚠️ admin | Self path whitelisted; admin grant path **unaudited** (finding 2). |
| Billing webhook replay | ✅ | `processed_stripe_events` PK dedupe. |
| Password-reset token reuse / brute force | ❌ | **Finding 1** — no rate limit, no attempt cap. |
| Password reset revokes sessions | ❌ | Only conditional via `recordAndRespond` (finding 12). |
| Partial DB transaction failure | ✅ mostly | Money/org/session paths are transactional repos. `topUpWallet` is the exception (finding 6). |
| Concurrent update conflicts | ❌ | No version/`updatedAt` guard on updates (finding 8). |
| Unsafe soft delete / retention | ⚠️ | Purge **ignores `legalHold`** (finding 7). |
| Missing audit trail | ❌ | **Finding 2** — sensitive events bypass the chain. |
| Job retries causing duplicate actions | ✅ | Scheduler idempotency keys + BullMQ single-delivery. |

---

## 4. Multi-tenancy

- **Model in force:** organization-scoped, via `organization_members` (compound
  unique `(orgId, userId)`, indexed). Every org route resolves membership before
  acting. Resources that belong to an org carry `orgId` FKs
  (`api_keys`, `subscriptions`, `usage_counters`, `file_attachments`,
  `tax_exemptions`, `trusted_devices`, `support_tickets`).
- **Finding 9 (Medium): the second, unused tenant model is a liability.**
  `tenants` table, `resolveTenant()`/`requireTenant()` (`middleware/tenant.ts`), and
  `X-Tenant-ID`/subdomain resolution are **never mounted** (`grep` shows only the
  re-export in `index.ts`). `tenantRateLimit` reads `c.get("tenantId")`
  (`rateLimiting.ts:177`) which is therefore never set — but if `resolveTenant()`
  were ever mounted as written, it would trust an **unauthenticated** `X-Tenant-ID`
  header/query with no check that the caller belongs to that tenant. That is a
  latent tenant-spoofing bug.
  - **Fix.** Either delete the tenant layer, or wire it *after* auth and validate
    membership: `tenantId` must be derived from the authenticated principal's
    org/tenant, never from a raw request header. Add tenant-isolation integration
    tests (attempt cross-org reads with a valid session and assert 403/404).
- **Recommendation.** Add a scoped-repository convention (`forOrg(orgId)`) so no
  handler can forget the `orgId` predicate, and consider Postgres RLS for the
  org-owned tables as defense-in-depth.

---

## 5. Compliance & data protection

- **🟠 Finding 7 (Medium/High for compliance): retention purge ignores legal hold.**
  `purgeScheduledDeletions()` (`gdpr.routes.ts:200–236`) loads **all** users and, for
  any past `deletionScheduledFor`, overwrites PII — **without checking
  `users.legalHold`**. The schema added `legalHold`/`legalHoldReason`
  (`schema.ts:46–48`) precisely to exempt accounts from purge, and this job ignores
  it. Purging a legal-hold account is a spoliation/compliance breach.
  - **Fix.** `if (u.legalHold) continue;` and query with a `WHERE` on the scheduled
    date instead of scanning the whole table (also fixes the perf issue).
- **GDPR export/delete** exist and are rate-limited (`gdpr.routes.ts`), soft-delete
  is 30-day with cancel — good. Export omits some collected PII (e.g. wallet,
  support tickets, feedback, push subscriptions); broaden it for a complete DSAR.
- **PCI scope:** card data is delegated to Stripe (no PAN storage) — good; keep it
  that way (Checkout/Portal only).
- **Audit/immutability:** blocked by finding 2 — SOC 2 CC7 evidence is materially
  weaker than the control catalog claims until the sensitive events are chained.
- **Australian Privacy Principles / Fair Work (if this hosts employee/payroll data):**
  the deletion, retention, and audit gaps above (findings 2, 7) are the ones that
  create direct regulatory exposure; fix those before storing regulated records.

---

## 6. Data integrity

- **🟠 Finding 6 (Medium, money path): `topUpWallet` race.** Unlike `spendFromWallet`
  (which uses a conditional `balance = balance - amount` SQL update — correct),
  `topUpWallet` (`wallet.repository.ts:22–43`) does read → compute
  `newBalance = current + amount` → write inside a transaction with **no row lock**.
  Under READ COMMITTED, two concurrent top-ups both read the same `current` and the
  second write clobbers the first → **lost funds**.
  - **Fix.** Mirror the spend path: `set({ balance: sql\`${walletsTable.balance} + ${amount}\` })`,
    or `SELECT … FOR UPDATE` the wallet row first. Add a unique idempotency key on
    `wallet_transactions.stripePaymentIntentId` so a Stripe retry can't double-credit.
- **🟡 Finding 8 (Medium): no optimistic locking.** Mutable rows (`organizations`,
  `saas_settings`, `subscriptions`, user profile) are updated last-write-wins with a
  bare `updatedAt = now()`. Two managers/admins editing concurrently silently lose
  one edit ("stale frontend overwrites newer backend"). Add a `version int` column
  and `WHERE version = :expected` on update (return 409 on mismatch), or gate on
  `updatedAt`.
- **Constraints that are good:** compound uniques on `organization_members`,
  `usage_counters` (`nullsNotDistinct`), `tax_exemptions`, `trusted_devices`;
  `processed_stripe_events`/`processed_webhook_events` idempotency; audit hash chain
  with advisory-lock serialization.
- **🟡 Finding 11 (Medium): missing indexes.** `otps` has **no index** (looked up by
  `(userId, type, code)` on every verify/reset — table grows with every OTP);
  `audit_logs` indexes only `timestamp` but admin queries filter by `actorId` and
  `action ILIKE` (`admin.routes.ts:611–612`). Add
  `otps(user_id, type)` and `audit_logs(actor_id)`; consider a GIN/trigram index if
  `action` search stays.

---

## 7. Performance & scalability

- **Read-replica routing** (`getReadDb`) is used for list/detail reads — good. But
  **finding 13 (Medium): it's also used for authorization** (`org.routes.ts`
  `requireMember`/`requireAdmin` call `getDb()` for membership in the mutating paths
  but several read paths authorize off the replica). Replica lag can briefly
  authorize a just-removed member or a just-revoked role. Authorization reads should
  hit the primary (or accept a small, documented staleness window with short TTLs).
- **`purgeScheduledDeletions` full-table scan** (finding 7) is O(users) every run —
  replace with a dated `WHERE`.
- **Activity-timestamp throttling** (`auth.middleware.activityRefreshSeconds`) is a
  nice touch that keeps hot reads off the write path — keep it.
- **Recommendations:** add DB query timeouts and a slow-query log; put the notification
  fan-out and any per-request Stripe round-trips behind the queue (webhook path
  already does); load-test the audit-chain writer (advisory lock serializes writes —
  validate it sustains your peak audit event rate, or shard the chain by day).

---

## 8. Code quality & maintainability

- **Unify the audit writer** (root cause of finding 2) — one function, always chains.
- **Centralize org authorization** — replace per-file `requireMember/Admin/Owner`
  with a `requireOrgPermission()` built on `hasOrgPermission()` so the fine-grained
  permission set is actually used.
- **Replace `as` casts on request bodies with Zod.** `password-reset.routes.ts`
  (`as { email, code, newPassword }`), `updateSettings(body)`, and several admin
  handlers parse untyped JSON. Every externally-reachable body should go through a
  schema (the project already standardizes on Zod elsewhere).
- **Naming.** `auditLog` vs `insertAuditLog` is a foot-gun; rename the logger one to
  `logSecurityEvent` (or fold it in) so intent is unambiguous.
- **Tests.** Add: password-reset brute-force/rate-limit test; tenant-isolation
  integration test (cross-org access denied); "last admin" guard test; wallet
  concurrent top-up test; retention-purge legal-hold test. These target the exact
  gaps above and would have caught findings 1, 4, 6, 7.

---

## 9. DevOps & production readiness

- **Good:** production fail-fast for `METRICS_AUTH_TOKEN`, `CORS_ALLOWED_ORIGINS`,
  `REDIS_URI`, and backup encryption (`config/index.ts:130–168`); dedicated worker
  topology; destructive-migration guard file; Dockerfile + compose; `/health` gates
  HTTP status on Postgres only (correct — a degraded cache shouldn't pull the API
  from rotation).
- **🟡 Finding 10 (Medium): hardcoded Neon host as fallback `DATABASE_URL`**
  (`config/index.ts:15–17`). The password is redacted to `***` in source (not a live
  credential leak), but a **real infra hostname/username/db** are committed and, more
  importantly, the app **fails open** to this endpoint when `DATABASE_URL` is unset
  instead of erroring. Remove the fallback; require `DATABASE_URL` (validation
  already lists it, but the `||` default prevents the check from ever firing).
- **Add to the prod fail-fast block:** `TOKEN_SECRET_HEX` and `CSFLE_MASTER_KEY_HEX`
  presence (finding 3).
- **Secrets hygiene:** scan git history for the redacted string's real value; rotate
  the Neon credential if it was ever committed un-redacted.
- **Rollback:** document a migration rollback path (Drizzle is forward-only by
  default); ensure backups are restore-tested (a backup you've never restored is a
  hope, not a control).

---

## Roadmap

### Immediate (this week — security/compliance blockers)
1. **Finding 1** — rate-limit `/auth/password-reset/*`, enforce `otps.attempts`,
   move to a long random reset token.
2. **Finding 2** — make `auditLog()` persist to the hash chain; add audit events to
   admin user/role/settings mutations.
3. **Finding 3** — fail closed in production when `TOKEN_SECRET_HEX` /
   `CSFLE_MASTER_KEY_HEX` are unset.
4. **Finding 7** — retention purge must honor `legalHold`.

### Short-term (this month)
5. **Finding 4** — last-admin / self-lockout guards.
6. **Finding 5** — Zod-validate + audit `PUT /admin/settings`.
7. **Finding 6** — SQL-increment `topUpWallet` + idempotency key on top-ups.
8. **Finding 12** — revoke all sessions on successful password reset.
9. **Finding 10** — remove the hardcoded DB fallback; require `DATABASE_URL`.
10. **Finding 11** — add `otps` and `audit_logs(actor_id)` indexes.
11. Add the five regression tests in §8.

### Long-term (this quarter — architecture)
12. **Finding 9** — resolve the dual tenant model: delete the unused layer *or* wire
    `resolveTenant` after auth with membership validation; add tenant-isolation tests.
13. **Finding 8** — optimistic-locking (`version`) on concurrently-edited resources.
14. **Finding 13** — route authorization reads to the primary; document staleness.
15. Centralize org-permission middleware; consider Postgres RLS on org-owned tables
    as defense-in-depth; unify the audit writer's public API and load-test the chain.

---

## Appendix A — Checklist items verified **sound** (no finding)

These items from the review scope were checked against source and are correctly
implemented — recorded here so the audit explicitly closes every checklist item,
and so these controls are preserved through the fixes above.

| Item | Verdict | Evidence |
|---|---|---|
| **CSRF** | ✅ N/A by design | No cookie-based session anywhere in the API — zero `setCookie`/`getCookie`/`Set-Cookie` in `src/api` or `src/middleware`. Auth is `Authorization: Bearer <PASETO>` only, which browsers don't attach cross-site, so classic CSRF doesn't apply. (Trade-off: `localStorage` tokens are XSS-readable — see `AUDIT-REPORT.md`; the global input sanitizer is the compensating control.) |
| **User-defined webhook SSRF** | ✅ Guarded | `src/webhooks/delivery.ts:88` sends via `fetchPublicUrl(endpoint.url, …)` (rejects IP literals, private/loopback/link-local/metadata hosts, non-default ports; `redirect:"error"` + timeout). Matches the CWE-918 rule. |
| **Webhook authenticity** | ✅ Signed | Outbound deliveries are HMAC-SHA256 signed (`createHmac`, `X-zerotrust-Signature` — `delivery.ts:14,64,69`). Stripe inbound verified against the raw body (`billing.webhooks.ts:35`). |
| **IDOR / object-level access** | ✅ Scoped (spot-checked) | `api-keys` filters/deletes by `and(eq(id), eq(userId, user.id))` (`api-keys.routes.ts:46,123`); `wallet` reads by `user.id` (`wallet.routes.ts:29,46`); `support` enforces `ticket.userId !== user.id && !isAgent → 403` and list-scopes by `userId` (`support.routes.ts:73,93,128,168`). No object-ownership IDOR on the routes reviewed. |
| **MFA / passkeys** | ✅ Present | TOTP + Email OTP + WebAuthn/passkeys (dedicated `passkeys` table, MDS3 attestation policy per org). Org policy can `requireMfaForAll` (see finding 5 re: audit of that toggle). |
| **Session revocation / rotation** | ✅ Sound | `authMiddleware` rejects expired/revoked sessions and `deleted`/`suspended` users; refresh rotation + reuse-family revocation (§2 "sound" list). |
| **Unsafe uploads** | ✅ Mostly | Avatar upload validates content-type against an allowlist and derives the extension server-side (`auth.routes.ts:1550,1568,1585`) → no path traversal / stored-XSS via extension. (Minor: unthrottled — Low finding 15.) |

> **Object-level access caveat.** The spot-check covered `api-keys`, `wallet`, and
> `support`. Before relying on "no IDOR," add an automated test that iterates every
> `:id`/`:orgId` route with a second user's token and asserts 403/404 — this is the
> only way to keep the property from regressing as routes are added.

---

*Findings are ranked by exploitability and blast radius, and every one cites a
concrete location in the current tree. Items the code gets right (token rotation,
webhook idempotency + SSRF-guarded delivery, wallet spend, transactional repos,
input sanitization, Bearer-only CSRF posture, object-scoped reads) are called out
so they're preserved through the fixes above.*
