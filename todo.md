# zerotrust — TODO

Consolidated, prioritized backlog of work that is **not yet shipped**. Shipped
features live in [`tdone.md`](./tdone.md); the standing audit is
[`docs/AUDIT.md`](./docs/AUDIT.md). The focused fork-readiness audit is
[`AUDIT-REPORT.md`](./AUDIT-REPORT.md).

**Priorities:** P0 critical/security · P1 stability/correctness · P2
maintainability/refactor · P3 scalability/performance · P4 docs/DX · P5 compliance.
**Status:** Pending · In Progress.

## P1 — Stability and correctness

### P1.1 — Expand repository + transaction layer for hot-path writes — _In Progress_

- **Source:** [`docs/AUDIT.md`](./docs/AUDIT.md) C1/M1; [`AUDIT-REPORT.md`](./AUDIT-REPORT.md) E6; ADR 006
- **Why:** Four transactional repositories exist (`authSessions`, `stripeEvents`,
  `wallet`, `processedWebhookEvents`). Billing mutations, org role transitions,
  session lifecycle side effects, and points-ledger writes still run as
  sequential inline Drizzle — a crash mid-sequence can leave partial state.
- **Acceptance:** Add repository methods (each owning `db.transaction` +
  invariants) for: refresh-token rotation (extend `authSessions`), billing
  subscription/plan mutations, org role transitions, and points ledger;
  route/services delegate to repos; regression tests for each hot path.
- **Status:** In Progress (~25% — wallet + auth session rotation seeded).

### P1.2 — Production worker topology enforcement — _Pending (ops)_

- **Source:** [`docs/AUDIT.md`](./docs/AUDIT.md) C3/P1; [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) P1; ADR 004
- **Why:** `src/worker.ts` and Redis leader locks exist, but cluster deploys
  without `WORKER_MODE=true` still start schedulers in every API replica.
- **Acceptance:** Document and enforce the split in [`docs/deployment.md`](./docs/deployment.md)
  and [`docs/reference-architecture.md`](./docs/reference-architecture.md): API
  replicas run with `WORKER_MODE=true` (schedulers deferred); exactly one worker
  process runs `bun run src/worker.ts`. Add a startup warning when schedulers run
  inside the API process in production.
- **Status:** Pending — code shipped; deploy discipline not enforced.

---

## P2 — Maintainability and refactoring

### P2.1 — Remove legacy `packages/ui/src/lib/api.ts` — _Pending_

- **Source:** [`docs/tanstack-query-progress.md`](./docs/tanstack-query-progress.md) post-rollout caveats
- **Why:** TanStack Query migration is complete (42/42 data-fetching pages). The
  legacy facade has zero production imports but remains as dead code; tests still
  mock it as a guard.
- **Acceptance:** Delete `lib/api.ts` (or reduce to a thin deprecated stub with a
  single migration note); update test mocks to target `apiClient` / server-state
  modules; `grep` confirms no `lib/api` imports under `packages/ui/src`.
- **Status:** Pending.

### P2.2 — Domain-oriented `services/` layout — _Pending_

- **Source:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) P7
- **Why:** `src/services/` is a flat directory of ~48 files; grouping by domain
  (`auth/`, `billing/`, `notifications/`, `compliance/`, `ops/`) improves
  navigability as the template grows.
- **Acceptance:** Move services into domain subdirectories; update imports; `bun
run boundaries:check` and full test suite stay green.
- **Status:** Pending.

### P2.3 — Backend features without UI exposure (product surface gaps) — _Pending_

- **Source:** [`docs/api-ui-integration-matrix.md`](./docs/api-ui-integration-matrix.md)
  (81 backend routes with no UI scan match); [`AUDIT-REPORT.md`](./AUDIT-REPORT.md) E4
- **Why:** Many unmatched routes are infra/SDK-only by design, but a meaningful
  subset are shipped backend features with no dashboard surface. Forks must
  either expose or consciously drop them.
- **Acceptance:** For each gap below, either add a UI page/component wired
  through `server-state/*` + `apiClient`, or document "API/SDK-only" in
  `openapi.json` tag descriptions and drop from the matrix unmatched list.
- **Gaps to decide (highest value first):**
  - `/admin/feedback` — admin feedback inbox
  - `/admin/roles` — system role CRUD
  - `/admin/jit-grants/*` — admin JIT grant approve/deny (distinct from
    `/jit/cross-tenant/*` user flows)
  - `/billing/tax-exemptions/*`, `/billing/vat/validate`, `/billing/usage`,
    `/billing/change-plan` — billing ops not on the billing page today
  - `/admin/attachments`, `/admin/lifecycle-emails` — admin content tools
  - `/admin/webhooks/{webhookId}/deliveries` — admin-wide delivery log (user
    webhooks page covers per-endpoint deliveries only)
  - `/search/index`, `/search/index/{type}/{id}`, `/search/provider` — search
    index management (admin)
  - `/regions/orgs/{orgId}/branding`, `/regions/orgs/{orgId}/domain` — org
    region/branding metadata (regions page covers health + pin only)
  - `/auth/unsubscribe` — email unsubscribe landing
  - `/wallet/spend` — programmatic spend (may stay API-only; document if so)
- **Status:** Pending.

---

## P3 — Scalability and performance

### P3.1 — UI component / integration test coverage toward 85% — _In Progress_

- **Source:** [`docs/AUDIT.md`](./docs/AUDIT.md) T1; [`docs/maintenance-scorecard.md`](./docs/maintenance-scorecard.md) §3
- **Why:** Server-state module tests grew significantly during the TanStack Query
  rollout, but page-level component/integration coverage is still below the 85%
  target. Auth, billing, org, and admin flows need broader regression nets.
- **Acceptance:** Expand `packages/ui` page/component tests for remaining
  high-traffic flows (dashboard home, profile, security/MFA, org settings,
  admin overview, compliance, regions); raise `vitest.config.ts` coverage
  ratchet thresholds incrementally; maintenance scorecard §3 shows ≥85% lines.
- **Status:** In Progress — harness + server-state tests in place; page coverage
  incomplete.

### P3.2 — Default read-heavy endpoints to the read replica — _In Progress_

- **Source:** [`docs/AUDIT.md`](./docs/AUDIT.md) P3
- **Why:** `getReadDb()` exists but is opt-in. List/admin/analytics endpoints
  still hit the primary unless explicitly switched.
- **Acceptance:** Audit all read-only list/detail/analytics handlers; route
  through `getReadDb()` where stale-read is acceptable; add route tests asserting
  replica usage; document replica lag expectations in [`docs/deployment.md`](./docs/deployment.md).
- **Status:** In Progress — sessions, notifications, org lists, and four admin
  list endpoints switched; remaining admin/analytics routes pending.

### P3.3 — Make Elasticsearch optional; default to Postgres FTS — _Pending_

- **Source:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) P3
- **Why:** After the slim-down, searchable surface is users/orgs/tickets and the
  service already has a Postgres fallback. Running ES is an operational burden
  most template forks do not need.
- **Acceptance:** `elasticsearch.enabled` defaults to `false`; search, audit,
  and logging paths use Postgres FTS / file fallback without requiring ES;
  README and deployment docs reflect ES as opt-in for large tenants.
- **Status:** Pending.

### P3.4 — Server-side data fetching (RSC / route handlers) — _Pending_

- **Source:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) P4
- **Why:** TanStack Query eliminated client-side `useEffect` waterfalls, but data
  still fetches in the browser. Next.js 16 RSC + route handlers can cut TTFB and
  client JS for dashboard/admin reads.
- **Acceptance:** Pilot one dashboard and one admin page with server-fetched
  initial data + client hydration for mutations; document the pattern in
  `docs/ui-http-client.md`.
- **Status:** Pending.

### P3.5 — CI gate for destructive migration DDL — _Pending_

- **Source:** [`docs/deployment.md`](./docs/deployment.md) §Release & migration safety;
  [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) P2; ADR 003
- **Why:** Expand/contract discipline is documented (P3.5 docs shipped 2026-07-01),
  but nothing in CI flags new `DROP`/`ALTER … DROP` migrations for human review.
- **Acceptance:** Add a CI step (or pre-commit script) that fails on new
  destructive DDL in `drizzle/` unless an allowlist file explicitly approves it.
- **Status:** Pending — docs done; automation not wired.

---

## P4 — Documentation and developer experience

### P4.2 — `/metrics` production default-closed — _Pending (ops)_

- **Source:** [`docs/AUDIT.md`](./docs/AUDIT.md) S3; [`docs/maintenance-scorecard.md`](./docs/maintenance-scorecard.md) §7
- **Why:** `/metrics` is open unless `METRICS_AUTH_TOKEN` is set. Guidance was
  added (P4.3 shipped); production deploys still need explicit token configuration.
- **Acceptance:** Deployment checklist requires `METRICS_AUTH_TOKEN` in
  production; reference architecture shows token-gated scrape config; scorecard §7
  tracks open exceptions to zero.
- **Status:** Pending — guidance done; per-deploy enforcement not verified.

### P4.3 — Strengthen fail-fast production config validation — _Pending_

- **Source:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) P6
- **Why:** `validateConfig()` checks core secrets but does not refuse to start in
  `NODE_ENV=production` when backup encryption, Redis, or other prod-critical
  vars are missing/weak.
- **Acceptance:** Zod (or extended `validateConfig`) gates production boot on
  required secrets (`BACKUP_ENCRYPTION_KEY_HEX` when backups enabled,
  `BACKUP_REQUIRE_ENCRYPTION`, `REDIS_URI`, etc.); integration test asserts
  refuse-to-start behavior.
- **Status:** Pending — basic validation exists; production-specific hardening
  incomplete.

### P4.4 — Quarterly maintenance scorecard — first baseline fill — _Pending_

- **Source:** [`docs/maintenance-scorecard.md`](./docs/maintenance-scorecard.md)
- **Why:** Scorecard template exists (P4.2 shipped 2026-07-01) but all metric
  cells are `_TBD_`.
- **Acceptance:** Populate Q3 2026 baseline (deps, CI duration, test count,
  migration health, backup drill dates, p95 latency); set next review date.
- **Status:** Pending.

### P4.5 — Token storage design revisit (optional hardening) — _Pending (fork decision)_

- **Source:** [`AUDIT-REPORT.md`](./AUDIT-REPORT.md) §D
- **Why:** Access/refresh tokens live in `localStorage` (SPA cross-origin
  architecture). Any injected JS can read them. Not a regression, but forks
  needing stronger XSS resistance may want httpOnly cookies + BFF.
- **Acceptance:** ADR or doc section comparing current SPA tokens vs BFF/cookie
  pattern with migration steps; no change required for the default template.
- **Status:** Pending — design decision for fork consumers.
