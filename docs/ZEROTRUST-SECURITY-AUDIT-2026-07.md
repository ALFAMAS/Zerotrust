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

> **Update — 2026-07-05.** All 17 findings below (2 Critical, 3 High, 8 Medium, 4
> Low) are fixed, tested, and verified. The fixes landed in two waves: the
> Critical/High wave merged to `main` via PR #67 (commits `e93f891`, `0144aa7`,
> `aceb156`, `818cd20`, `04d1fd2`), and the remainder were then either
> incorporated into `main` directly by follow-up work (M6 core, M7 filter, M8
> code, M9, M10, M11 schema, findings 14–16) or completed on branch
> `claude/roster-app-audit-qxc12q` (M7 scheduler wiring, M6 wallet-creation
> race + real-Postgres concurrency test, the missing M8/M11 migrations, M13,
> finding 17, and re-added verification tests for findings 15/16). Every
> finding's **Status** line below states exactly where its fix lives and how it
> was verified.
>
> Verification state on the fix branch: all finding-specific tests pass; the
> full suite runs 1,109 passing tests across 148/154 files. The 51 failures in
> the remaining 6 files (`auth.routes`, `oauth`, `telemetry.middleware`,
> `profile.optimisticLock`, `authMiddleware.branches`, `auth.middleware.join`)
> are byte-identical on a pristine `origin/main` checkout — pre-existing
> breakage from recent main-line work, not from these fixes; the same holds
> for the 65 `tsc --noEmit` errors (identical count on pristine main). The
> destructive-migration guard and Biome pass clean on all changed files.

---

## Executive summary

zerotrust is a genuinely strong auth foundation: PASETO v4 tokens, refresh-token
rotation with reuse detection and family revocation, Stripe webhook idempotency,
a conditional-update wallet spend path, transactional repositories for the money
and org-ownership paths, a global XSS sanitizer, and centralized `safeFetch`/
`safeRedirect` helpers. The CWE-hardening discipline in `CLAUDE.md` is real and
mostly holds in code.

The problems are not in the primitives — they are in **wiring and fail-safes**:

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | **Critical** | Password-reset OTP is brute-forceable: no rate limit on the route, no attempt counter, 6-digit code | ✅ Fixed |
| 2 | **Critical** | The "tamper-evident audit log" is bypassed by the sensitive events; core admin mutations write no audit at all | ✅ Fixed |
| 3 | **High** | `TOKEN_SECRET_HEX` / `CSFLE_MASTER_KEY_HEX` silently auto-generate when unset — prod can boot with ephemeral keys (token failures across replicas; CSFLE data loss on restart) | ✅ Fixed |
| 4 | **High** | No "last admin" / self-lockout protection on system-admin role and user delete/suspend | ✅ Fixed |
| 5 | **High** | Admin security-settings changes are unvalidated and unaudited (`updateSettings` spreads raw body) | ✅ Fixed |
| 6 | Medium | `topUpWallet` is read-modify-write → lost top-ups under concurrency (money path) | ✅ Fixed |
| 7 | Medium | Retention purge ignores `legalHold` and full-scans the users table | ✅ Fixed |
| 8 | Medium | No optimistic locking / version fields → concurrent-edit lost updates | ✅ Fixed |
| 9 | Medium | Vestigial multi-tenant layer (`tenants`, `resolveTenant`, `X-Tenant-ID`) is never mounted; tenant rate-limit trusts an unauthenticated header | ✅ Fixed |
| 10 | Medium | Hardcoded Neon DB host as a fallback `DATABASE_URL`; app fails *open* to it | ✅ Fixed |
| 11 | Medium | Missing indexes on `otps` and `audit_logs(actor_id)` for growth/hot paths | ✅ Fixed |
| 12 | Medium | Password reset doesn't revoke existing sessions on success | ✅ Fixed |
| 13 | Medium | Authorization checks read the **replica** (`getReadDb`) → lag can authorize a just-removed member | ✅ Fixed |
| 14 | Low | CORS reflects any origin whenever `NODE_ENV` isn't exactly `"production"` — not just recognized dev/test envs | ✅ Fixed |
| 15 | Low | Avatar upload endpoint (`POST /me/avatar`) has no rate limit | ✅ Fixed |
| 16 | Low | Impersonation token doesn't carry an `act_as` delegation claim | ✅ Fixed |
| 17 | Low | `.env.example` secret comments drifted from the actual production fail-fast requirements | ✅ Fixed |

The two Criticals are both exploitable/blocking for a real SaaS launch. Fix them
first; they are small, localized changes.

All 17 findings above have been fixed and verified — see the **Status** bullet
at the end of each finding's write-up below (§2, §4–§9) for the fix commit and
how it was verified.

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
- **Status.** ✅ Fixed (`e93f891`). Added `rateLimit()` to both `/request` and
  `/confirm`; `/confirm` now reads and atomically increments `otps.attempts`
  and locks the OTP out after 5 wrong guesses; comparison uses a constant-time
  `safeCodeEquals()` instead of `===`; a new `/request` call invalidates any
  prior outstanding OTP for that user; and a successful reset now
  unconditionally calls `revokeAllSessionsForUser()` (this also closes finding
  12 — previously that only happened conditionally via `recordAndRespond`).
  *Verified:* `src/__tests__/password-reset.routes.test.ts` (brute-force
  lockout, real rate-limiter 429s, prior-OTP invalidation, and the
  unconditional session-revocation case).

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
- **Status.** ✅ Fixed (`0144aa7`). `auditLog()` (`src/logger/index.ts`) now
  dynamically imports `insertAuditLog()` and persists to the hash chain in
  addition to its existing logger/SIEM/ES fan-out, so every call site that was
  already using it — including the 5 sensitive events listed above — now
  writes to `audit_logs` automatically with no call-site changes needed. Also
  added explicit `auditLog()` calls to the previously-silent core admin
  mutations: suspend/delete user, grant/revoke role, and `PUT /admin/settings`.
  *Verified:* `src/__tests__/logger.auditLog.test.ts` (confirms `auditLog()`
  now reaches the chain writer) and `src/__tests__/admin.routes.mutations.test.ts`
  (confirms each previously-silent admin mutation now emits an audit event).

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
- **Status.** ✅ Fixed (`aceb156`, merged via PR #67; since strengthened on
  main). Production boot fails closed when `TOKEN_SECRET_HEX` or
  `CSFLE_MASTER_KEY_HEX` is not present in the environment. Follow-up work on
  main moved this enforcement into a Zod `EnvSchema`
  (`src/config/env.ts`) and added rejection of documented placeholder values
  (all-zero / all-same-nibble hex) in production. Outside production the
  auto-generated fallback remains (dev convenience) with a loud warning.
  `.env.example` documents the requirement (finding 17). *Verified:*
  `src/__tests__/config.production.test.ts`.

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
- **Status.** ✅ Fixed (`818cd20`). Added a `wouldOrphanAdmins()` helper used
  by `DELETE /admin/users/:id`, `PATCH /admin/users/:id` (suspend/delete), and
  `DELETE /admin/users/:id/roles/:roleName` — each now refuses the action when
  it would drop the active-admin count to 0, and separately refuses
  `actorId === targetId` for the destructive self-actions. *Verified:*
  `src/__tests__/admin.routes.mutations.test.ts` (last-admin-guard and
  self-lockout cases).

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
- **Status.** ✅ Fixed (`04d1fd2`, merged via PR #67; version guard landed with finding 8). `PUT
  /admin/settings` now validates the body against a strict, bounded
  `settingsUpdateSchema` (Zod) before it reaches `updateSettings()`, and every
  successful change now writes an `admin.settings_changed` audit event (closes
  the finding-2 tie-in for this route). The update also now takes an optional
  `expectedVersion` and returns 409 on a concurrent-edit conflict (finding 8).
  *Verified:* `src/__tests__/admin.routes.mutations.test.ts`.

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
  (The non-production reflect-any convenience was scoped too broadly — see Low
  finding 14, now fixed.)
- **Input sanitization**, `safeFetch` (SSRF), `safeRedirect` (open-redirect) are
  centralized and mounted.

### 🔵 Low 14–17

- **Finding 14 — CORS reflect-any scoped too broadly.** `resolveCorsOrigin()`
  reflected any origin whenever `NODE_ENV` was anything other than exactly
  `"production"` and no allowlist was configured — so a staging/preview
  deployment with a missing or non-standard `NODE_ENV` would silently allow
  credentialed cross-origin requests from any origin instead of failing
  closed. **Status.** ✅ Fixed on main, with a stronger design than the audit
  suggested: non-production reflect-any was removed entirely. When no
  allowlist is configured outside production, only the fixed
  `DEV_CORS_ORIGINS` localhost origins (3000/1337) plus `APP_URL` are
  permitted (`src/middleware/cors.ts`); production still fails closed, and
  the Zod `EnvSchema` additionally refuses to boot production without
  `CORS_ALLOWED_ORIGINS`. *Verified:* `src/__tests__/cors.test.ts` (arbitrary
  origins denied even in development; localhost dev origins allowed;
  production fail-closed and allowlist cases).
- **Finding 15 — avatar upload unthrottled.** `POST /me/avatar`
  (`auth.routes.ts`) carried no rate limiter, unlike its sibling
  authenticated routes in the same file, letting a caller hammer it with
  large multipart uploads (disk/S3 writes, DB updates) at no cost.
  **Status.** ✅ Fixed on main: the route mounts `rateLimit({ points: 10,
  windowSecs: 3600 })`, matching the pattern used on other authenticated,
  resource-intensive routes in the file. The verification test was lost in a
  later test-file rewrite and re-added on the fix branch (`f23034b`).
  *Verified:* "POST /me/avatar rate limiting" suite in
  `src/__tests__/auth.routes.test.ts` (real rate-limiter module, asserts 429
  after exceeding the configured limit).
- **Finding 16 — impersonation token doesn't chain the delegation.** The
  token minted by `POST /admin/users/:id/impersonate`
  (`admin-tools.routes.ts`) carried no `act_as` claim, so nothing downstream
  could attribute actions taken during an impersonated session back to the
  admin who started it (RFC 8693-style delegation, `AuditPrincipal.actAs` in
  `src/shared/principal.ts`). **Status.** ✅ Fixed on main:
  `act_as: [admin.id]` is in the token payload, and the route additionally
  refuses to mint an impersonation token from a session that is already
  impersonating (no delegation chaining) or against another admin. The
  verification tests were lost in a test-file rewrite and re-added on the fix
  branch (`f23034b`), covering both the claim and the no-chaining guard.
  *Verified:* `src/__tests__/admin-tools.routes.test.ts`.
- **Finding 17 — secret-doc drift.** `.env.example`'s comments for
  `TOKEN_SECRET_HEX`, `CSFLE_MASTER_KEY_HEX`, `REDIS_URI`,
  `CORS_ALLOWED_ORIGINS`, `METRICS_AUTH_TOKEN`, and the backup-encryption
  vars no longer matched what the boot validation actually enforces — most
  visibly, `METRICS_AUTH_TOKEN`'s comment claimed it was only needed for
  "internet-facing" deploys while the schema requires it whenever
  `NODE_ENV=production`, and the CORS comment still described the removed
  reflect-any dev behavior. **Status.** ✅ Fixed (`a41ed59`). Rewrote each
  comment to state plainly which vars are boot requirements in production
  (including the placeholder-secret rejection and the `REDIS_URL` alias),
  matching `src/config/env.ts`'s `EnvSchema` line-by-line. Docs-only change.

---

## 3. Failsafe & validation checks (gap table)

| Concern | Enforced? | Evidence / gap |
|---|---|---|
| Cross-tenant (cross-org) data access | ✅ | Org routes check membership per handler; **authorization reads now hit the primary** (finding 13, ✅ fixed) and an org-RLS middleware backs org-scoped routes. |
| Disabled/deleted user still active | ✅ | `authMiddleware` rejects `deleted`/`suspended`; admin delete revokes sessions. |
| Revoked invite still usable | ✅ | `acceptOrgInvite` checks `usedAt`/`expiresAt` in-tx. |
| Duplicate org creation | ✅ | `organizations.slug` unique; create is transactional. |
| Owner removed without replacement | ✅ org / ✅ system-admin | Org owner guarded; last system admin now guarded too (finding 4, ✅ fixed). |
| Role escalation | ✅ self / ✅ admin | Self path whitelisted; admin grant path now audited (finding 2, ✅ fixed). |
| Billing webhook replay | ✅ | `processed_stripe_events` PK dedupe. |
| Password-reset token reuse / brute force | ✅ | **Finding 1** — rate limit + attempt cap added (✅ fixed). |
| Password reset revokes sessions | ✅ | Now unconditional (finding 12, ✅ fixed alongside finding 1). |
| Partial DB transaction failure | ✅ | Money/org/session paths are transactional repos. `topUpWallet` fixed with atomic increments + idempotency + creation-race guard (finding 6, ✅ fixed). |
| Concurrent update conflicts | ✅ | `version` guard on `organizations`/`saas_settings`/`users` updates + migration (finding 8, ✅ fixed). |
| Unsafe soft delete / retention | ✅ | Purge honors `legalHold` and actually runs on the retention schedule (finding 7, ✅ fixed). |
| Missing audit trail | ✅ | **Finding 2** — sensitive events now persist to the hash chain (✅ fixed). |
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
  - **Status.** ✅ Fixed on main. Deletion was chosen over wiring: no live
    feature depended on the tenant layer, so `middleware/tenant.ts`
    (`resolveTenant`/`requireTenant`) and `tenantRateLimit()` are gone, the
    `tenants` tables are dropped by migration `drizzle/0032_drop_tenants.sql`,
    and no remaining code path trusts the unauthenticated `X-Tenant-ID`
    header. The organization-scoped model is the single enforced tenant
    boundary (now further backed by an org-RLS middleware on org-scoped
    routes). *Verified:* `grep` confirms no remaining references to
    `resolveTenant`/`requireTenant`/`tenantRateLimit` in `src/`.
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
  - **Status.** ✅ Fixed in two parts. The query-level `legalHold = false`
    filter and dated `WHERE` (no full-table scan) landed on main inside
    `gdpr.routes.ts`. But nothing actually *ran* the purge — it wasn't wired
    into any scheduler. The fix branch (`4c237a6`) moves
    `purgeScheduledDeletions()` into `dataRetention.ts`, adds an in-loop
    defense-in-depth legal-hold check, and wires it into
    `runRetentionPolicies()` (the BullMQ `retention.purge` job, every 24h).
    *Verified:* `src/__tests__/dataRetention.test.ts` (legal-hold accounts
    skipped, non-held scheduled accounts purged, included in the retention
    run) and `src/__tests__/gdpr.purge.test.ts`.
- **GDPR export/delete** exist and are rate-limited (`gdpr.routes.ts`), soft-delete
  is 30-day with cancel — good. Export omits some collected PII (e.g. wallet,
  support tickets, feedback, push subscriptions); broaden it for a complete DSAR.
- **PCI scope:** card data is delegated to Stripe (no PAN storage) — good; keep it
  that way (Checkout/Portal only).
- **Audit/immutability:** was blocked by finding 2, now ✅ fixed (`0144aa7`) —
  the sensitive events listed in §2 now chain, closing this SOC 2 CC7 gap.
- **Australian Privacy Principles / Fair Work (if this hosts employee/payroll data):**
  the deletion, retention, and audit gaps above (findings 2, 7) created direct
  regulatory exposure and are now both ✅ fixed.

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
  - **Status.** ✅ Fixed in two parts. Main's rewrite gave `topUpWallet` an
    atomic SQL increment (`balance = balance + $amount`) plus a Stripe
    payment-intent idempotency check — closing the balance-clobber race and
    the double-credit case. The real-Postgres concurrency test added on the
    fix branch then caught a residual race in that rewrite: the
    create-wallet-if-missing insert had no conflict handling, so two
    concurrent *first* top-ups both inserted the same `user_id` PK and the
    loser aborted with a duplicate-key error (credit lost by exception
    instead of by clobber). Fixed with `onConflictDoNothing()` (`7b99edf`).
    *Verified:* `src/__tests__/wallet.repository.concurrency.test.ts` — 20
    parallel top-ups on a fresh wallet plus interleaved top-ups/spends
    against a live Postgres; fails on the unguarded insert, passes with it (a
    mocked DB has no real transaction isolation to violate) — plus main's own
    `wallet.topup.test.ts` unit cases.
- **🟡 Finding 8 (Medium): no optimistic locking.** Mutable rows (`organizations`,
  `saas_settings`, `subscriptions`, user profile) are updated last-write-wins with a
  bare `updatedAt = now()`. Two managers/admins editing concurrently silently lose
  one edit ("stale frontend overwrites newer backend"). Add a `version int` column
  and `WHERE version = :expected` on update (return 409 on mismatch), or gate on
  `updatedAt`.
  - **Status.** ✅ Fixed. The code side landed on main: `version` columns on
    `organizations` and `saas_settings` (and, going further than the audit
    asked, `users` — `PATCH /auth/me` now takes an optional expected
    version), updates gated on `WHERE version = :expected` with an atomic
    increment and a 409 `VERSION_CONFLICT` on mismatch. The schema declared
    the columns but **no migration created them** — a database migrating via
    the SQL files (rather than `db:push`) would break the moment a
    version-gated update ran. The fix branch adds the idempotent migration
    (`drizzle/0035_org_settings_version.sql`, `1277ead`), applied and
    verified against live Postgres. `subscriptions` remains intentionally out
    of scope (Stripe-driven, already idempotent via
    `processed_stripe_events`). *Verified:* `org.routes.test.ts`, the
    settings conflict case in `admin.routes.mutations.test.ts`, and
    `profile.optimisticLock.test.ts` on main's side.
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
  - **Status.** ✅ Fixed. The split schema on main declares both
    `otps_user_id_type_idx` and `audit_logs_actor_id_idx`, but no migration
    created them — deployed databases migrating via SQL files would never get
    either index. The fix branch adds the idempotent migration
    (`drizzle/0034_otps_audit_logs_indexes.sql`, `a21a288`; hand-authored
    because `drizzle-kit generate` is blocked by pre-existing
    migration-snapshot drift, see §9). *Verified:* applied against live
    Postgres and confirmed present in `pg_indexes`.

---

## 7. Performance & scalability

- **Read-replica routing** (`getReadDb`) is used for list/detail reads — good. But
  **finding 13 (Medium): it's also used for authorization** (`org.routes.ts`
  `requireMember`/`requireAdmin` call `getDb()` for membership in the mutating paths
  but several read paths authorize off the replica). Replica lag can briefly
  authorize a just-removed member or a just-revoked role. Authorization reads should
  hit the primary (or accept a small, documented staleness window with short TTLs).
  - **Status.** ✅ Fixed (`dab0f34` on the fix branch). Authorization-gating
    reads (`isOrgMember`/`canManageOrg` in `globalization.routes.ts`,
    `canManageOrgBilling` in `billing.routes.ts`, and the ticket-ownership
    check in `support.routes.ts`) now call `getDb()` (primary) instead of
    `getReadDb()`. Non-gating list/detail reads are unaffected and continue to
    use the replica. *Verified:* `src/__tests__/billing.routes.authz.test.ts`,
    `globalization.routes.authz.test.ts`, and a new case in
    `support.routes.test.ts` — each wires primary and replica to *different*
    membership data and proves the authorization decision follows the
    primary, not the replica.
- **`purgeScheduledDeletions` full-table scan** (finding 7) is O(users) every run —
  replace with a dated `WHERE`. **Status.** ✅ Fixed alongside finding 7's
  legal-hold gap — the query filters at the SQL level (dated `WHERE` on the
  scheduled-deletion timestamp) instead of scanning the whole table.
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
  **Status.** ✅ Added, as part of fixing each finding rather than as a
  separate pass: `password-reset.routes.test.ts` (brute-force/rate-limit),
  `admin.routes.mutations.test.ts` (last-admin guard),
  `wallet.repository.concurrency.test.ts` (real-Postgres concurrent top-up —
  which caught a second, residual race; see §6),
  and `dataRetention.test.ts` + `gdpr.purge.test.ts` (legal-hold). The
  dedicated tenant-isolation integration test wasn't added — finding 9 was
  resolved by deleting the unmounted tenant layer entirely (see §4), so there
  is no remaining tenant-resolution code path for that test to exercise (the
  org-RLS middleware added on main now covers the org boundary instead).

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
  - **Status.** ✅ Fixed on main. `databaseUrl` is
    `process.env.DATABASE_URL ?? ""`, so the "DATABASE_URL environment
    variable is required" check actually fires when it's unset instead of
    silently connecting to the committed host — now enforced through the Zod
    `EnvSchema` in `src/config/env.ts`. `.env.example` documents the
    requirement (finding 17). *Verified:*
    `src/__tests__/config.production.test.ts`.
- **Add to the prod fail-fast block:** `TOKEN_SECRET_HEX` and `CSFLE_MASTER_KEY_HEX`
  presence (finding 3). **Status.** ✅ Fixed alongside finding 3 (`aceb156`,
  since moved into the `EnvSchema` with placeholder-value rejection).
- **Secrets hygiene:** scan git history for the redacted string's real value; rotate
  the Neon credential if it was ever committed un-redacted. *(Out of scope for this
  fix pass — requires access to hosting/Neon credentials this review doesn't have;
  flagged for the team to action directly.)*
- **Rollback:** document a migration rollback path (Drizzle is forward-only by
  default); ensure backups are restore-tested (a backup you've never restored is a
  hope, not a control). *(Not part of the numbered findings; still open.)*
- **Discovered during the fix pass (not one of the 17 numbered findings, flagged
  for separate follow-up):**
  - The Drizzle migration history has pre-existing, unrelated drift: snapshots
    are missing for migrations 0027–0029, and migration 0026's snapshot still
    lists tables (`achievements`, `redemptions`, `streaks`) that don't exist in
    the current `schema.ts`. `drizzle-kit generate` cannot run non-interactively
    as a result, which is why findings 8/11's migrations were hand-authored and
    verified directly against Postgres instead. Separately, migrations 0013 and
    0017 both create `access_review_items`, confirmed via a fresh database —
    `drizzle-kit migrate` will fail on a clean install. Neither issue was
    introduced by this fix pass; both need a dedicated migration-history cleanup.
  - A possible IDOR in `search.routes.ts`/`search.service.ts`: a client-supplied
    `orgId` query parameter is used without an accompanying membership check.
    Not one of the 17 findings in this audit's original scope (found while
    fixing finding 13's replica-read pattern) and not fixed here — worth a
    follow-up look. (The org-RLS middleware since added on main may mitigate
    this on routes where it's mounted — verify whether search is covered.)
  - The migration drift grew during the recent main-line work: SQL files
    0030–0033 exist in `drizzle/` with **no journal entries**, and several
    schema changes (the `version` columns, the `otps`/`audit_logs` indexes)
    were declared in the split schema with **no migration at all** — the two
    gaps this fix branch closes with 0034/0035. A `db:push`-provisioned
    database and a migration-provisioned one now genuinely diverge; the
    migration-history cleanup above is becoming urgent.
  - Recent main-line commits left the repo's own gates red: 51 test failures
    across 6 files (`auth.routes`, `oauth`, `telemetry.middleware`,
    `profile.optimisticLock`, `authMiddleware.branches`,
    `auth.middleware.join`) and 65 `tsc --noEmit` errors exist on a pristine
    `origin/main` checkout, before any of this branch's changes. This branch
    adds none (verified by running the identical file set on both); fixing
    them is separate work.

---

## Roadmap

> **All items 1–14 below are ✅ done** (see the Status bullet on each finding in
> §2/§4–§9 for the fix commit and verification). Item 15 (broader architectural
> cleanup, not a numbered finding) remains open — see notes below.

### Immediate (this week — security/compliance blockers)
1. ✅ **Finding 1** — rate-limit `/auth/password-reset/*`, enforce `otps.attempts`,
   move to a long random reset token. *(`e93f891`, merged via PR #67; includes
   constant-time comparison + prior-OTP invalidation, beyond the minimum ask.)*
2. ✅ **Finding 2** — make `auditLog()` persist to the hash chain; add audit events to
   admin user/role/settings mutations. *(`0144aa7`, merged via PR #67)*
3. ✅ **Finding 3** — fail closed in production when `TOKEN_SECRET_HEX` /
   `CSFLE_MASTER_KEY_HEX` are unset. *(`aceb156`, merged via PR #67; since
   strengthened into the Zod `EnvSchema` with placeholder rejection)*
4. ✅ **Finding 7** — retention purge must honor `legalHold`. *(filter on main;
   scheduler wiring in `4c237a6`)*

### Short-term (this month)
5. ✅ **Finding 4** — last-admin / self-lockout guards. *(`818cd20`, merged via
   PR #67)*
6. ✅ **Finding 5** — Zod-validate + audit `PUT /admin/settings`. *(`04d1fd2`,
   merged via PR #67)*
7. ✅ **Finding 6** — SQL-increment `topUpWallet` + idempotency. *(core on main;
   wallet-creation race + real-Postgres concurrency test in `7b99edf`)*
8. ✅ **Finding 12** — revoke all sessions on successful password reset. *(`e93f891`,
   done alongside finding 1)*
9. ✅ **Finding 10** — remove the hardcoded DB fallback; require `DATABASE_URL`.
   *(on main, enforced via `EnvSchema`)*
10. ✅ **Finding 11** — add `otps` and `audit_logs(actor_id)` indexes. *(schema on
    main; the missing migration in `a21a288`)*
11. ✅ Add the regression tests in §8 — added per-finding rather than as a
    separate batch (see the §8 Tests status note for the file list).

### Long-term (this quarter — architecture)
12. ✅ **Finding 9** — resolve the dual tenant model: deleted the unused,
    never-mounted tenant layer outright rather than wiring it. *(on main, incl.
    `0032_drop_tenants.sql`)*
13. ✅ **Finding 8** — optimistic-locking (`version`) on `organizations`,
    `saas_settings`, and (beyond the ask) `users`. *(code on main; the missing
    migration in `1277ead`; `subscriptions` intentionally out of scope — see §6)*
14. ✅ **Finding 13** — route authorization reads to the primary. *(`dab0f34`)*
15. **Open (not a numbered finding).** Centralize org-permission middleware;
    consider Postgres RLS on org-owned tables as defense-in-depth; unify the
    audit writer's public API surface (it works correctly post-finding-2, but
    the two-function naming is still a foot-gun per §8); load-test the audit
    chain's advisory-lock serialization; clean up the migration-snapshot drift
    and the `access_review_items` double-creation noted in §9; look into the
    possible `search.routes.ts` IDOR noted in §9.

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
| **IDOR / object-level access** | ✅ Scoped (spot-checked) | `api-keys` filters/deletes by `and(eq(id), eq(userId, user.id))` (`api-keys.routes.ts:46,123`); `wallet` reads by `user.id` (`wallet.routes.ts:29,46`); `support` enforces `ticket.userId !== user.id && !isAgent → 403` and list-scopes by `userId` (`support.routes.ts:73,93,128,168`). No object-ownership IDOR on the routes reviewed. **Caveat added post-review:** a possible IDOR was separately noticed in `search.routes.ts`/`search.service.ts` (client-supplied `orgId` with no membership check) — outside this audit's original scope, not fixed here, flagged in §9 for follow-up. |
| **MFA / passkeys** | ✅ Present | TOTP + Email OTP + WebAuthn/passkeys (dedicated `passkeys` table, MDS3 attestation policy per org). Org policy can `requireMfaForAll` (see finding 5 re: audit of that toggle). |
| **Session revocation / rotation** | ✅ Sound | `authMiddleware` rejects expired/revoked sessions and `deleted`/`suspended` users; refresh rotation + reuse-family revocation (§2 "sound" list). |
| **Unsafe uploads** | ✅ | Avatar upload validates content-type against an allowlist and derives the extension server-side (`auth.routes.ts:1550,1568,1585`) → no path traversal / stored-XSS via extension. Previously unthrottled (Low finding 15) — now rate-limited, ✅ fixed. |

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
