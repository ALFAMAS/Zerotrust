# zerotrust — TODO

## Deleted stale docs

| File | Reason |
| --- | --- |
| `AUDIT-REPORT.md` | Fork-readiness snapshot (2026-07-04) claimed the open backlog was empty; superseded by the 2026-07-04 Zero Trust SaaS audit findings below. Shipped work remains in [`tdone.md`](./tdone.md). |
| `docs/ZEROTRUST-SECURITY-AUDIT-2026-07.md` | Prior zero-trust audit (2026-07-03) marked most items fixed and asserted webhook IDOR was not present; contradicted by the senior re-audit (ZT-1). Open work consolidated here; fixed items remain in git history. |

**Still current:** [`docs/AUDIT.md`](./docs/AUDIT.md) (production-readiness standing audit), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/PROJECT_HISTORY.md`](./docs/PROJECT_HISTORY.md), ADRs, [`docs/compliance/`](./docs/compliance/), [`tdone.md`](./tdone.md).

---

## Zero Trust SaaS audit backlog

_Sourced from the 2026-07-04 senior-level Zero Trust SaaS audit (static code review). Does not duplicate shipped work in [`tdone.md`](./tdone.md) or closed items in [`docs/AUDIT.md`](./docs/AUDIT.md)._

**Verification baseline (2026-07-04):** `bun run test` → 1003 API + 239 UI tests; nine repos under `src/db/repositories/`; SOC 2 observation window active (2026-07-04 — 2027-07-03).

---

## Immediate (this week — security / compliance blockers)

- [ ] **ZT-1** — **Critical** — Cross-tenant IDOR in webhook management API  
  **Problem:** `GET /webhooks` returns every endpoint system-wide (including HMAC `secret`) when `tenantId` is omitted; `tenantId` is an unverified query/body param. `GET/PATCH/DELETE /webhooks/:id` and `POST /webhooks/:id/ping` perform pure ID lookups with no ownership check. Exploitable via the shipped UI (`/dashboard/webhooks`).  
  **Fix:** Scope endpoints server-side from the caller's org membership (never from request-supplied `tenantId`); add ownership checks on every `:id` route; add regression test (org A cannot read/mutate org B's webhooks).  
  **Paths:** `src/webhooks/routes.ts`, `src/webhooks/store.ts`, `packages/ui/src/lib/server-state/webhooks.ts`, `packages/ui/src/app/dashboard/webhooks/page.tsx`

- [ ] **ZT-2** — **High** — Content-Security-Policy never sent in production  
  **Problem:** `src/middleware/securityHeaders.ts` implements CSP/HSTS/frame-options and is unit-tested in isolation, but `src/api/server.ts` mounts Hono's bare `secureHeaders()` instead — no `Content-Security-Policy` header, weaker HSTS and `X-Frame-Options`. Undermines ADR 008's stated XSS compensating control for `localStorage` tokens.  
  **Fix:** Replace or compose with `securityHeaders()` in `server.ts`; add integration test on the real app asserting `content-security-policy` is present.  
  **Paths:** `src/api/server.ts`, `src/middleware/securityHeaders.ts`, `src/__tests__/middleware.test.ts`, `docs/adr/008-token-storage-design-revisit.md`

- [ ] **CP-1** — **Critical** — SOC 2 risk register overstates data residency controls  
  **Problem:** Risk R-006 ("Data residency violation") is marked `mitigated` citing `storageRegion`, geo-routing, and `canAccessRegion()` — but `canAccessRegion()`'s strict branch never runs (`residency` is not in config), fallback allows EU→US access, and `storageRegion` is a label only (single `DATABASE_URL` + one S3 config for the deployment).  
  **Fix:** Immediately downgrade R-006 to `partial`/`open` in auditor-facing evidence; either implement real per-region storage routing or restate the product claim as logical region tagging only.  
  **Paths:** `src/services/compliance/compliance.service.ts`, `src/services/ops/region.service.ts`, `src/db/schema.ts` (`organizations.storageRegion`), `docs/compliance/soc2-auditor-readiness.md`, `docs/compliance/evidence/2026/risk-assessment/2026-annual-risk-assessment.md`

- [ ] **DQ-1** — **High** — Shipped `Dockerfile` does not start the API  
  **Problem:** (1) `BUN_VERSION`/`NODE_VERSION` ARGs are never interpolated into `FROM` lines — stages use bare `bun`/`node` (effectively `:latest`), ignoring `.bun-version`. (2) Runtime `CMD` launches `src/index.ts` / `dist/index.js` (export barrel, no listener) instead of `dist/api/server.js` (what `package.json` `"start"` uses). `docker compose up` for the API service never binds a port.  
  **Fix:** Interpolate version tags in `FROM`; point `CMD` at `src/api/server.ts` / `dist/api/server.js`; add CI job that builds the image and curls `/health`.  
  **Paths:** `Dockerfile`, `src/index.ts`, `src/api/server.ts`, `package.json`, `docker-compose.yml`, `.bun-version`

---

## Short-term (this quarter)

- [ ] **ARCH-1** — **High** — Two incompatible multi-tenancy models coexist  
  **Problem:** `organizations` is the real, wired tenancy boundary; `tenants` table (OIDC/SAML config, no FK to orgs/users) is orphaned enterprise-SSO leftover after migration `0024_drop_enterprise_federation.sql`. `cross_tenant_jit_requests` uses free-text tenant IDs defaulting to `"default"`.  
  **Fix:** Either wire `tenants` → `organizations` (1:1 FK) and reconcile JIT fields, or delete `tenants` table/routes and document JIT tenant fields as informational-only.  
  **Paths:** `src/db/schema.ts`, `drizzle/0024_drop_enterprise_federation.sql`, `src/api/routes/tenant.routes.ts`, `src/models/tenant.model.ts`, `src/jit/`

- [ ] **ARCH-2** — **Medium** — `/admin/tenants/*` missing `authMiddleware`  
  **Problem:** `tenant.routes.ts` checks `isAdmin(c.get("user"))` but never runs `authMiddleware` first; `server.ts` mounts the router bare. `c.get("user")` is always `undefined` on the real server — entire admin tenant surface 403s for everyone. Unit tests inject `user` directly, masking the wiring bug.  
  **Fix:** Add `router.use("*", authMiddleware)` before the admin guard (mirror `admin.routes.ts`); add integration test through `createServer()`.  
  **Paths:** `src/api/routes/tenant.routes.ts`, `src/api/server.ts`, `src/__tests__/tenant.routes.test.ts`

- [ ] **MT-1** — **High** — No org-scoping lint / query guard (process fix)  
  **Problem:** Tenant isolation is 100% ad hoc per-handler `WHERE orgId = …` with no RLS or CI lint. ZT-1 proves one forgotten check causes silent cross-tenant data leaks.  
  **Fix:** Add grep-based CI lint or a Drizzle query-builder wrapper requiring an explicit org filter for org-scoped tables; fail build when a query lacks an org predicate.  
  **Paths:** `src/db/schema.ts`, `scripts/` (new check), `.github/workflows/ci.yml`

- [ ] **FS-1** — **Medium** — Audit log immutability is app-layer only  
  **Problem:** Hash chain detects tampering via `verifyAuditChain()` but no DB trigger/role prevents direct `UPDATE`/`DELETE` on `audit_logs`. Trailing row deletion moves the chain tip backward with no in-chain evidence unless external anchoring is enabled.  
  **Fix:** Add `BEFORE UPDATE OR DELETE` trigger (or `REVOKE UPDATE, DELETE` for app role); enable `AUDIT_ANCHOR_ENABLED` by default in production reference architecture.  
  **Paths:** `src/audit/chain.ts`, `src/audit/anchor.ts`, `drizzle/` (new migration), `docs/reference-architecture.md`, `docs/compliance/audit-log-anchoring-plan.md`

- [ ] **FS-2** — **Medium** — `requirePlan()` built but mounted on zero routes  
  **Problem:** `requirePlan()` and `planAllows()` are implemented and unit-tested but never called from any route — README advertises server-side plan gates that are inert. Even if wired, lookup is by `userId` only, not `orgId` subscription.  
  **Fix:** Apply `requirePlan("feature")` to paywalled routes (and fix org-subscription lookup), or document plan gating as UI-only.  
  **Paths:** `src/middleware/requirePlan.ts`, `src/shared/plans.ts`, `src/__tests__/plans.test.ts`, `src/api/routes/`

- [ ] **ZT-4** — **Medium** — Config validation accepts known placeholder secrets  
  **Problem:** `validateConfig()` checks length ≥ 64 hex chars only; the all-zero placeholder in `docker-compose.yml` and `.env.example` passes. A production deploy copying compose without rotating secrets boots with a publicly known PASETO/CSFLE key.  
  **Fix:** Reject all-zero / documented example values in production; optional compose healthcheck fail when placeholder detected with `NODE_ENV=production`.  
  **Paths:** `src/config/index.ts`, `docker-compose.yml`, `.env.example`, `src/__tests__/config.production.test.ts`

- [ ] **ZT-3** — **Medium** — Bearer tokens in `localStorage` (revisit after ZT-2)  
  **Problem:** Access + refresh tokens in `localStorage`; access token mirrored in a non-`httpOnly` cookie for RSC prefetch. Documented trade-off (ADR 008) but CSP compensating control is inactive (ZT-2).  
  **Fix:** After ZT-2, evaluate ADR 008 Option C (in-memory access token + `httpOnly` refresh cookie) as a lower-cost intermediate step.  
  **Paths:** `packages/ui/src/lib/auth.ts`, `docs/adr/008-token-storage-design-revisit.md`, `docs/adr/006-token-storage-and-rotation.md`

- [ ] **MT-2** — **Medium** — Cross-tenant JIT uses unvalidated free-text tenant IDs  
  **Problem:** `cross_tenant_jit_requests.requestor_tenant_id` / `target_tenant_id` are plain `text`, not FKs to `organizations` or `tenants`, default `"default"`. Cannot validate tenant membership at the data layer.  
  **Fix:** Back with real `orgId` FKs or scope/rename as stub pending ARCH-1 cleanup.  
  **Paths:** `src/db/schema.ts`, `src/jit/routes.ts`, `src/jit/`

- [ ] **MT-3** — **Low** — Inconsistent tenant-scoping columns  
  **Problem:** Most tables use `orgId uuid` FK to `organizations`; `webhook_endpoints.tenant_id` is nullable `text` with no FK — two non-interoperable conventions.  
  **Fix:** Standardize on `orgId uuid references organizations.id`; migrate `webhook_endpoints.tenant_id` as part of ZT-1 fix.  
  **Paths:** `src/db/schema.ts`, `src/webhooks/store.ts`, `drizzle/` (new migration)

---

## Long-term (multi-quarter)

- [ ] **MT-1 (RLS)** — **High** — Postgres Row-Level Security as defense-in-depth  
  **Problem:** Application-layer org filters are the only isolation backstop; any missed predicate is a silent cross-tenant leak (see ZT-1).  
  **Fix:** Add RLS policies on high-value org-scoped tables (`billing`, webhooks, support tickets); set `app.org_id` per request from `authMiddleware`.  
  **Paths:** `src/db/schema.ts`, `src/middleware/auth.ts`, `drizzle/` (RLS migrations), `src/db/index.ts`

- [ ] **CP-1 (full)** — **High** — Physical per-region data residency  
  **Problem:** `storageRegion` does not route to separate databases or S3 buckets; all orgs share one Postgres instance and one object-store config.  
  **Fix:** If data residency is a contractual commitment, implement region-sharded storage (separate DB/bucket per region, request routed by org `storageRegion`).  
  **Paths:** `src/services/ops/region.service.ts`, `src/config/index.ts`, `docs/deployment.md`, `docs/reference-architecture.md`

- [ ] **DI-1** — **Low** — Monolithic 949-line schema file  
  **Problem:** All 41 tables in one `schema.ts` — merge-conflict and navigation cost; orphaned `tenants` definition easy to miss (ARCH-1).  
  **Fix:** Split by domain (`schema/identity.ts`, `schema/billing.ts`, etc.) re-exported from `schema/index.ts`, mirroring `services/` domain regrouping.  
  **Paths:** `src/db/schema.ts`, `src/db/index.ts`

- [ ] **FS-3** — **Low** — Read-modify-write race on passkey JSONB arrays  
  **Problem:** `registerPasskey()` reads `usersTable.passkeys`/`mfa` then writes full array with no `SELECT … FOR UPDATE` or atomic JSONB append — concurrent registrations can lose a passkey silently.  
  **Fix:** Row lock before read, or atomic `jsonb || jsonb` append in SQL.  
  **Paths:** `src/db/repositories/passkeys.repository.ts`

- [ ] **DQ-2** — **Low** — Test coverage below stated 85% target  
  **Problem:** API coverage ratchet ~67% lines / 60% branches / 65% statements; UI ~55% lines vs 85% long-term aspiration in `docs/maintenance-scorecard.md`. Historical 30-day CI success ~42% (remediated 2026-07-03).  
  **Fix:** Continue incremental ratchet in `vitest.config.ts` / `packages/ui/vitest.config.ts`; raise floors over time.  
  **Paths:** `vitest.config.ts`, `packages/ui/vitest.config.ts`, `docs/maintenance-scorecard.md`, `.github/workflows/ci.yml`

- [ ] **ZT-3 (BFF)** — **Medium** — Full BFF / httpOnly-cookie auth pattern  
  **Problem:** `localStorage` token storage remains XSS-readable; strongest posture requires same-origin cookie session (ADR 008 Option B).  
  **Fix:** Implement BFF proxy (Next.js route handlers issue `httpOnly` session cookies; API tokens never reach browser JS) for deployments needing maximum XSS resistance.  
  **Paths:** `packages/ui/src/lib/auth.ts`, `packages/ui/src/lib/apiClient.ts`, `docs/adr/008-token-storage-design-revisit.md`, `docs/extending.md`

- [ ] **ARCH-3** — **Low** — Dead geo/temporal middleware creates enforcement ambiguity  
  **Problem:** `geoFencingMiddleware()` and `temporalAccessMiddleware()` are mounted only on the `/protected` demo endpoint; org-level country restriction is enforced separately via `sessionPolicy.service.ts` inside `authMiddleware`. Two implementations, only one live — nothing marks the other as legacy.  
  **Fix:** Delete unused middleware or apply to real routes; fold unique logic into `sessionPolicy.service.ts`.  
  **Paths:** `src/middleware/geoFencing.ts`, `src/middleware/temporalAccess.ts`, `src/api/server.ts`, `src/services/auth/sessionPolicy.service.ts`

- [ ] **CP-2** — **Low** — GDPR export incomplete for Art. 15 "all personal data"  
  **Problem:** `GET /gdpr/export` omits wallet transactions, support tickets, feedback, notifications, passkey metadata; audit log query filters `actorId` only, not `targetId`.  
  **Fix:** Extend export to all `userId`-scoped tables; include audit rows where user is target.  
  **Paths:** `src/api/routes/gdpr.routes.ts`

---

## Not backlog (verified shipped or intentional)

| Item | Verdict |
| --- | --- |
| P0–P5 production-readiness audit (`docs/AUDIT.md`) | Shipped — [`tdone.md`](./tdone.md) |
| Repository layer, worker topology, module boundaries, webhook idempotency | Shipped — [`tdone.md`](./tdone.md) |
| TanStack Query migration (48/48 data pages) | Complete — [`docs/tanstack-query-progress.md`](./docs/tanstack-query-progress.md) |
| Audit log external anchoring (P5.1) | Shipped — `src/audit/anchor.ts`, migration `0029` |
| Apple Sign In OAuth | Deferred — no `src/oauth/providers/apple.ts` |
| BFF / httpOnly cookie auth (default) | Fork path — ADR 008; tracked as ZT-3 long-term |
| `GET /auth/unsubscribe`, `POST /wallet/spend` UI gaps | SDK-only by design — `docs/api-ui-integration-matrix.md` |
