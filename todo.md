# zerotrust — TODO

## Security baseline (`docs/security.md`)

Audit date: **2026-07-05**. Verified/completed items moved to [`tdone.md`](./tdone.md) § Security baseline audit.

**Verification (2026-07-05, re-audited):** SEC-5…SEC-27 rechecked against codebase, tests, and CI — **23 items remain open** below. **SEC-1…SEC-4 shipped 2026-07-05** → [`tdone.md`](./tdone.md) § Security baseline audit (evidence: `revokeSessionAtLogout`, `auth.login-timing.test.ts`, `hashTokenSha256` in `password-reset.routes.ts`, `0038_org_rls_expansion.sql`). **SEC-28** (Expo out-of-scope) documented → [`tdone.md`](./tdone.md). DQ-2 unchanged (API floors 67/60% lines/branches per scorecard; long-term 85% target). **SEC-23 note:** weekly grouped bumps via `.github/workflows/dependency-update.yml` exist, but no Dependabot/Renovate manifest — item stays open.

### Critical / High

- [ ] **SEC-5** — **High** — No single `assertCan()` authorization choke point (§2)  
       **Problem:** Org authz is scattered (`requireMember`, `requireOwner`, inline `hasOrgPermission`, `requireAdmin`). Baseline requires one deny-by-default gate for new endpoints.  
       **Fix:** Add `assertCan(principal, action, resource)` in `src/shared/permissions.ts` (or adjacent module) and migrate hot paths; document in PR checklist §10.  
       **Paths:** `src/shared/permissions.ts`, `src/api/routes/org.routes.ts`, `src/middleware/auth.ts`  
       **Refs:** §2 Permissions

- [ ] **SEC-6** — **High** — `NotificationBell` SSE leaks access token (CWE-532) (§4)  
       **Problem:** `NotificationBell.tsx` reads `localStorage.getItem("token")` (legacy) and passes it as `?token=` on the EventSource URL. Tokens in query strings hit logs, proxies, and browser history. ADR 008 stores access tokens in memory + non-httpOnly cookie only.  
       **Fix:** Use cookie/credentials-based SSE auth or short-lived SSE ticket endpoint; remove localStorage token read.  
       **Paths:** `packages/ui/src/components/NotificationBell.tsx`, `src/api/routes/notification.routes.ts`  
       **Refs:** §4 Secrets; CWE-532

- [ ] **SEC-7** — **High** — Missing Hono CSRF origin middleware (§3)  
       **Problem:** No `hono/csrf` (or equivalent origin check) on cookie-authenticated JSON routes. CORS + SameSite=Lax partially mitigates but baseline stack lists explicit CSRF middleware.  
       **Fix:** Mount `csrf({ origin: env.APP_ORIGIN })` on web cookie paths; exempt bearer/API-key/mobile routes.  
       **Paths:** `src/api/server.ts`, `src/middleware/cors.ts`  
       **Refs:** §3 Middleware stack

### Medium

- [ ] **SEC-8** — **Medium** — Password hashing uses bcryptjs, not Bun argon2id (§1)  
       **Problem:** Register/login/reset use `bcrypt.hash` with configurable rounds. Baseline specifies OWASP-minimum `Bun.password` argon2id (19 MiB / timeCost 2).  
       **Fix:** Migrate to `Bun.password.hash/verify` with documented params; rehash on next login.  
       **Paths:** `src/api/routes/auth.routes.ts`, `src/api/routes/password-reset.routes.ts`, `src/config/index.ts`  
       **Refs:** §1 Passwords

- [ ] **SEC-9** — **Medium** — Refresh cookie lacks `__Host-` prefix (§1)  
       **Problem:** Cookie name `za_refresh_token` with path `/auth/token/refresh` — not host-only `__Host-` prefix enforced by browsers.  
       **Fix:** Rename to `__Host-…`, set `path: "/"`, omit Domain; update `authCookies.ts` + tests.  
       **Paths:** `src/shared/authCookies.ts`, `src/__tests__/auth.routes.test.ts`  
       **Refs:** §1 Web sessions

- [ ] **SEC-10** — **Medium** — Refresh rotation has no `family_id` lineage (§1)  
       **Problem:** Reuse detection revokes **all** user refresh tokens/sessions (`revokeRefreshTokenFamily(userId)`), not a token family subtree. Baseline schema: `family_id`, mark `used_at`, revoke descendants only.  
       **Fix:** Add `family_id` to `refresh_tokens`; scope reuse revocation to family; migrate rotation in `authSessions.repository.ts`.  
       **Paths:** `src/db/schema/identity.ts`, `src/db/repositories/authSessions.repository.ts`, `src/api/routes/auth.routes.ts`  
       **Refs:** §1 Mobile sessions (rotation pattern applies to web refresh too)

- [ ] **SEC-11** — **Medium** — `activeOrgId` resolved from `X-Org-Id` header (§2)  
       **Problem:** `authMiddleware` sets `activeOrgId` from client header. Baseline: tenant ID comes **only** from session, never params/body/headers.  
       **Fix:** Persist selected org on session row; derive org from session JOIN; treat `X-Org-Id` as hint validated against membership only after session org is authoritative.  
       **Paths:** `src/middleware/auth.ts`, `src/db/schema/identity.ts` (`sessionsTable`)  
       **Refs:** §2 Tenant ID from session

- [ ] **SEC-12** — **Medium** — No tenant-scoped repo factory pattern (§2)  
       **Problem:** Org filtering is per-handler/repository convention (`orgs.repository`, `webhooks/store`) rather than `shiftsRepo(orgId)` constructors that structurally require orgId on every query.  
       **Fix:** Introduce org-scoped repo factories for high-risk domains; enforce via TypeScript (orgId required arg) + CI.  
       **Paths:** `src/db/repositories/`, `scripts/check-org-scoping.ts`  
       **Refs:** §2 Data layer requires the tenant

- [ ] **SEC-13** — **Medium** — No global request body size limit (§3)  
       **Problem:** `bodyLimit({ maxSize: 1_048_576 })` from baseline not mounted in `server.ts`. Large payloads can DoS the API process.  
       **Fix:** Add `hono/body-limit` (or equivalent) early in middleware stack.  
       **Paths:** `src/api/server.ts`  
       **Refs:** §3 Middleware stack

- [ ] **SEC-14** — **Medium** — Input validation not standardized on `@hono/zod-validator` (§3)  
       **Problem:** Routes mix manual `c.req.json()`, ad-hoc checks, and occasional `z.safeParse`. Baseline requires `@hono/zod-validator` on every body/query/param with parsed output only.  
       **Fix:** Incrementally adopt `zValidator` on new/changed routes; audit mass-assignment (no body spread into `.set()`).  
       **Paths:** `src/api/routes/*.ts`  
       **Refs:** §3 Input validation; §10 checklist

- [ ] **SEC-15** — **Medium** — Rate limiting is per-IP only — no per-user tier (§3)  
       **Problem:** Global `rateLimit()` keys on client IP; no authenticated per-user budget separate from IP. API keys have per-key limits but session users do not.  
       **Fix:** Add optional `userId`-scoped Redis bucket alongside IP for `/api/*` authenticated routes.  
       **Paths:** `src/middleware/rateLimiting.ts`, `src/api/server.ts`  
       **Refs:** §3 Rate limiting

- [ ] **SEC-16** — **Medium** — Structured log redaction paths incomplete (§3 / CWE-532)  
       **Problem:** Custom `getLogger()` lacks pino-style `redact.paths` for `Authorization`, `Cookie`, `*.password`, `*.token`. Error handler redacts some values ad hoc only.  
       **Fix:** Add centralized redaction in logger before ES/SIEM fan-out; extend paths when new sensitive fields appear.  
       **Paths:** `src/logger/index.ts`, `src/api/errorHandler.ts`  
       **Refs:** §3 Errors and logging

- [ ] **SEC-17** — **Medium** — Account lockout vs progressive delay (§3)  
       **Problem:** `accountLockout.ts` hard-locks accounts after N failures (DoS primitive against known emails). Baseline prefers progressive delay / CAPTCHA over lockout.  
       **Fix:** Replace or soften lockout with exponential backoff + optional CAPTCHA/PoW (signup PoW pattern exists).  
       **Paths:** `src/middleware/accountLockout.ts`, `src/api/routes/auth.routes.ts`  
       **Refs:** §3 Rate limiting

- [ ] **SEC-18** — **Medium** — Email verification not enforced before privileged actions (§1)  
       **Problem:** `emailVerifiedAt` column exists but no middleware blocks unverified users from org create, billing, API keys, etc.  
       **Fix:** Add `requireEmailVerified` middleware on privileged route mounts; return uniform 403.  
       **Paths:** `src/middleware/auth.ts`, `src/api/routes/org.routes.ts`, `src/api/routes/billing.routes.ts`, `src/api/routes/api-keys.routes.ts`  
       **Refs:** §1 Account lifecycle

- [ ] **SEC-19** — **Medium** — No `server-only` boundary on UI secret/DB modules (§4)  
       **Problem:** No `"server-only"` imports in `packages/ui`; mis-importing `serverApiClient` into a client component would not fail at build time.  
       **Fix:** Add `server-only` package; mark `serverApiClient.ts`, `prefetch.ts` server paths; audit client graph.  
       **Paths:** `packages/ui/src/lib/serverApiClient.ts`, `packages/ui/src/lib/server-state/prefetch.ts`  
       **Refs:** §4 Secrets

- [ ] **SEC-20** — **Medium** — Access token mirrored in non-httpOnly cookie (§1 / §4)  
       **Problem:** `auth.ts` sets `document.cookie` for `za_access_token` (RSC prefetch mirror). Readable by JS — XSS can steal it. ADR 008 tradeoff vs baseline “access token in memory only.”  
       **Fix:** Document accepted tradeoff or move prefetch auth to httpOnly session cookie / BFF pattern.  
       **Paths:** `packages/ui/src/lib/auth.ts`, `packages/ui/src/lib/serverApiClient.ts`, `docs/adr/008-token-storage-design-revisit.md`  
       **Refs:** §1 Web sessions; §4 Authorization at data layer

- [ ] **SEC-21** — **Medium** — Environment validation is partial, not Zod `Env.parse` (§7)  
       **Problem:** `validateConfig()` checks required keys in production but no single Zod schema for `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `APP_ORIGIN`, `STRIPE_WEBHOOK_SECRET`, etc.  
       **Fix:** Add `src/config/env.ts` with Zod schema; call at boot before route mount.  
       **Paths:** `src/config/index.ts`, `src/__tests__/config.production.test.ts`  
       **Refs:** §7 Secrets & environment

- [ ] **SEC-22** — **Medium** — No `gitleaks` CI gate (§7 / §8)  
       **Problem:** Baseline requires gitleaks in CI; workflow has Semgrep + Trivy + `bun audit` but no secret scanning.  
       **Fix:** Add gitleaks action (or trufflehog) to `.github/workflows/ci.yml`.  
       **Paths:** `.github/workflows/ci.yml`  
       **Refs:** §7; §8 Supply chain

- [ ] **SEC-23** — **Medium** — No Renovate/Dependabot config (§8)  
       **Problem:** Lockfile committed and `bun audit` runs; weekly `dependency-update.yml` opens grouped PRs but baseline expects Dependabot/Renovate manifest for npm/bun + GitHub Actions.  
       **Fix:** Add `.github/dependabot.yml` or `renovate.json` (can complement the existing weekly workflow).  
       **Paths:** `.github/`  
       **Refs:** §8 Supply chain

- [ ] **SEC-24** — **Medium** — GitHub Actions pinned by tag, not commit SHA (§8)  
       **Problem:** CI uses `actions/checkout@v4`, `oven-sh/setup-bun@v2`, etc. Baseline: pin by full commit SHA.  
       **Fix:** Pin third-party actions to immutable SHAs (Dependabot can bump).  
       **Paths:** `.github/workflows/ci.yml`  
       **Refs:** §8 Supply chain

- [ ] **SEC-25** — **Medium** — Separate Postgres `app` / `migrator` roles not implemented (§6)  
       **Problem:** Single `DATABASE_URL` role with full DML/DDL via deploy user. Baseline: `app` role subject to `FORCE RLS`, `migrator` for DDL only.  
       **Fix:** Document + add migration/setup script for dual roles; restrict app connection in reference architecture.  
       **Paths:** `docs/reference-architecture.md`, `docs/deployment.md`, `docker-compose.yml`  
       **Refs:** §6 Database

- [ ] **SEC-26** — **Medium** — Login / failed-login events not in tamper-evident audit log (§9)  
       **Problem:** Webhook event types `auth.login.success` / `auth.login.failure` exist but auth routes do not call `auditLog()` or dispatch on login. Baseline append-only audit expects login trails.  
       **Fix:** `auditLog("auth.login.success" | "auth.login.failure", …)` in login path; optional outbound webhook dispatch.  
       **Paths:** `src/api/routes/auth.routes.ts`, `src/logger/index.ts`, `src/webhooks/delivery.ts`  
       **Refs:** §9 Ops (append-only audit log)

### Low / Ops (document + deploy)

- [ ] **SEC-27** — **Low** — VPS firewall / private Postgres+Redis binding (§9)  
       **Problem:** Codebase documents Coolify/VPS deploy but ufw/default-deny and private DB interfaces are operator runbook items, not verified in repo automation.  
       **Fix:** Add/check deploy checklist in `docs/deployment.md` with ufw + bind-address steps; optional CI doc lint.  
       **Paths:** `docs/deployment.md`, `docs/reference-architecture.md`  
       **Refs:** §9 Ops

---

## Long-term

- [ ] **DQ-2** — **Low** — Test coverage below stated 85% target  
       **Problem:** API coverage ~64.6% lines / ~55.5% branches; UI ~54.6% lines vs 85% long-term aspiration in `docs/maintenance-scorecard.md`.  
       **Fix:** Continue incremental ratchet in `vitest.config.ts` / `packages/ui/vitest.config.ts`; raise floors over time.  
       **Paths:** `vitest.config.ts`, `packages/ui/vitest.config.ts`, `docs/maintenance-scorecard.md`, `.github/workflows/ci.yml`  
       **Status (2026-07-05):** Floors aligned to measured baseline (API 64/61/55/63; UI 54/52/46/51). Long-term 85% target — incremental ratchet ongoing.
