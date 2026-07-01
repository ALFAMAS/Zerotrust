# zerotrust — TODO

Prioritized, acceptance-criteria-driven backlog. Findings come from
[`docs/AUDIT.md`](./docs/AUDIT.md) (2026-06-29) and the standing architecture
reviews. This is the single backlog — it absorbs the forward-looking items from
the now-archived `PRODUCTION_SAFETY_TODO.md` and `SAAS_TEMPLATE_ARCHITECTURE_RECOMMENDATIONS.md`
(see [`docs/PROJECT_HISTORY.md`](./docs/PROJECT_HISTORY.md)). Shipped features are
tracked in [`tdone.md`](./tdone.md), not here.

**Priorities:** P0 critical/security · P1 stability/correctness · P2
maintainability/refactor · P3 scalability/performance · P4 docs/DX.
**Status values:** Pending · In Progress · Done.

---

## P0 — Critical security or breaking issues

_All P0 items completed. See tdone.md for the full ledger._

---

## P1 — Stability and correctness

### P1.1 — Repository + transaction layer for hot-path writes  — _Status: Done (2026-07-01)_
- **Why:** Only 2 files used `db.transaction`; refresh-token rotation, session
  lifecycle, billing, wallet/points ledger, and org role transitions ran as
  loose statements — a crash mid-sequence left partial state (AUDIT C1/M1).
- **Files:** `src/db/repositories/pointsLedger.repository.ts` (new),
  `src/db/repositories/wallet.repository.ts` (new), `src/db/repositories/authSessions.repository.ts`
  (was seed), `src/services/points.service.ts`, `src/services/wallet.service.ts`,
  `src/__tests__/wallet.spend.test.ts`.
- **Acceptance:** points `awardPoints` wrapped in `db.transaction` (read-balance
  + insert-entry atomic via `pointsLedger.repository.ts`); wallet `topUpWallet`
  and `spendFromWallet` moved to transactional `wallet.repository.ts` (wallet
  update + transaction insert atomic; conditional UPDATE guard preserved for
  double-spend); services delegate to repos with storage-fallback wrappers;
  `authSessions.repository.ts` already had `rotateRefreshToken` and
  `revokeRefreshTokenFamily` in transactions. ✅
- **Risk:** Medium (touches billing-core wallet/points — covered by existing
  `wallet.spend.test.ts`).

### P1.2 — Centralized background-jobs module (+ fix cluster-mode duplication)  — _Status: Done (2026-07-01)_
- **Why:** The BullMQ consumer and the four 24h schedulers (retention,
  notification fallback, billing lifecycle, `pg_dump` backup) started
  unconditionally in the HTTP process with no instance guard. Under PM2 cluster
  mode (`-i max`) **every** instance ran them → N nightly backups + duplicate
  dunning emails (AUDIT C3/P1).
- **Files:** `src/jobs/registry.ts` (new, Zod-typed job definitions),
  `src/jobs/scheduler.ts` (new, Redis-lock leader election per job tick),
  `src/worker.ts` (new, dedicated worker entrypoint),
  `src/api/server.ts` (gated: `WORKER_MODE=true` skips schedulers in API).
- **Acceptance:** job registry with names + Zod payload schemas (4 interval
  jobs); Redis `SET NX PX` lock per job tick for single-instance enforcement;
  `startJobScheduler()` dispatches via dynamic imports; `src/worker.ts` runs
  email queue + all schedulers as a separate, single-instance process; API
  process auto-detects `WORKER_MODE` and defers schedulers when the worker is
  present — backward compatible (local dev / single-server still starts them
  in-process). ✅
- **Risk:** High (changes runtime scheduling — `WORKER_MODE` flag gating preserves
  backward compat; local dev unchanged).

---

## P2 — Maintainability and refactoring

### P2.1 — Type the Stripe / webhook payloads  — _Status: Done (2026-06-30)_
- See tdone.md.

### P2.2 — Module boundaries + import-linter  — _Status: Done (2026-07-01)_
- **Why:** No enforced partition; cross-domain coupling grew silently (AUDIT M3).
- **Files:** `.boundaries.json`, `scripts/check-boundaries.ts`,
  `docs/adr/007-module-boundaries.md`, `package.json` (`boundaries:check` script).
- **Acceptance:** 7-domain boundary map (shared, integrations, identity, tenancy,
  billing, compliance, ops) with enforced dependency direction; CI script scans
  imports and flags violations; 0 violations at commit time; ADR documenting the
  strategy. ✅
- **Risk:** Medium.

### P2.3 — Typed UI→API contract enforcement  — _Status: Done (2026-07-01)_
- **Why:** 11 raw `fetch()` calls in `packages/ui` instead of the generated SDK
  / `apiClient` wrapper; drift between UI and `openapi.json` was undetected
  (AUDIT).
- **Files:** `packages/ui/src/components/FeedbackWidget.tsx` (→ `apiPost`),
  `packages/ui/src/app/status/page.tsx` (→ `apiGet` + `skipAuth`),
  `packages/ui/src/app/dashboard/profile/page.tsx` (→ `apiPostFormData`),
  `packages/ui/src/app/admin/page.tsx` (→ `apiGetBlob`),
  `packages/ui/src/app/dashboard/account/page.tsx` (→ `apiGetBlob`).
- **Acceptance:** 5 of 7 raw fetch calls converted to `apiClient`; remaining 2
  are legitimate pre-auth/server-component exceptions (OAuth handoff in login
  page, referral redirect in `r/[slug]`); audit script already tracks these. ✅
- **Risk:** Low.

---

## P3 — Scalability and performance

### P3.1 — UI component / integration tests  — _Status: In Progress (2026-07-01)_
- **Why:** `packages/ui` had only `lib/*.test.ts` (plain logic); no component or
  page-level tests, so auth/billing/admin regressions can land silently
  (AUDIT T1).
- **Files:** `packages/ui/vitest.config.ts` (new — happy-dom + Testing Library,
  kept separate from the root `environment: "node"` config), `packages/ui/src/test/setup.ts`
  (new — jest-dom matchers, `sonner` mock, per-test cleanup), `vitest.config.ts`
  (root — narrowed the `packages/ui` include to `.ts` only so `.tsx` component
  tests don't run under the wrong environment), `.github/workflows/ci.yml`
  (new "UI component tests" step in the Tests job).
- **Done:** harness stood up and enforced in CI; first tests written —
  `components/SetupChecklist.test.tsx` (6 cases: empty state, progress count,
  completion card + API notify, dismiss + localStorage persistence) and
  `app/(auth)/login/page.test.tsx` (5 cases: render, login success + redirect,
  MFA step transition, MFA verify completion, passkey-unsupported guard).
  11 new tests, colocated with their components per the existing `lib/*.test.ts`
  convention.
- **Acceptance:** happy-dom/Testing-Library project ✅; login covered ✅.
  Remaining from the original acceptance criteria — register/reset-password
  states, org role/invite forms, billing/plan gates, admin tables — not yet
  covered; extend incrementally following the same pattern.
- **Risk:** Low (new test infra + colocated tests; no production code changed).
### P3.2 — Default read-heavy endpoints to the read replica  — _Status: In Progress (2026-07-01)_
- **Done:** switched the verified read-only admin list endpoints (`GET /admin/users`,
  `/admin/stats`, `/admin/audit-logs`, `/admin/feedback`) to `getReadDb()`.
  `getReadDb()` falls back to the primary when no replica is configured, so
  behavior is unchanged unless `DATABASE_URL_READ_REPLICA` is set. `/admin/sessions`
  left on the primary (its handler also writes). Extend to other pure-read list
  endpoints (org/session/search/notification lists) in follow-ups.
### P3.3 — Offload heavy webhook work to the queue  — _Status: Done (2026-07-01)_
- **Delivered:** extracted the event-mutation logic from `billing.webhooks.ts`
  into `src/services/stripeWebhookProcessor.ts` (shared by both paths), and
  added `src/services/stripeWebhookQueue.ts` — a BullMQ queue that offloads the
  Stripe `subscriptions.retrieve()` call + Postgres write off the request path
  when `REDIS_URI` is configured. The route claims the idempotency key inline
  (unchanged), enqueues, and acks fast (`{ received: true, queued: true }`).
  The worker releases the claim only once BullMQ's retries are exhausted, so a
  manual Stripe-dashboard replay can reprocess it. Falls back to the exact
  prior synchronous claim→process→release-on-error flow when no queue is
  configured, so behavior is unchanged without Redis. Wired: `server.ts`
  always starts the producer (webhooks only arrive there); the consumer runs
  in `server.ts` (single-process, `WORKER_MODE` unset) or `worker.ts`
  (`WORKER_MODE=true`). Tests: `stripeWebhookQueue.test.ts` (7 cases) +
  a new queued-path case in `billing.webhooks.test.ts`. 757 tests pass.
### P3.4 — Plugin/capability contract for optional-heavy integrations  — _Status: Pending_
### P3.5 — Deploy & release safety (expand/contract, rollback, DR drills)  — _Status: Done (2026-07-01)_
- **Delivered:** `docs/deployment.md` "Release & migration safety" section —
  expand/contract discipline for destructive migrations (`0020`–`0024` are
  one-way), pre-migration verified backup + staging-first, one-command app
  rollback (PM2/containers), and restore-drill RTO/RPO evidence via
  `dr-restore-drill.yml`. Cross-links the backup/restore + incident runbooks.

---

## P4 — Documentation and developer experience

### P4.1 — ADRs for load-bearing decisions  — _Status: Done (2026-07-01)_
- **Files:** `docs/adr/001-paseto-v4-tokens.md`, `002-modular-monolith.md`,
  `003-drizzle-orm.md`, `004-redis-bullmq-sessions.md`, `005-generated-sdk.md`,
  `006-token-storage-and-rotation.md`, `007-module-boundaries.md`.
- **Acceptance:** one ADR per decision (context/decision/consequences). ✅

### P4.2 — Quarterly maintenance scorecard  — _Status: Done (2026-07-01)_
- **Files:** `docs/maintenance-scorecard.md`.
- **Acceptance:** 8-tracked metric areas (deps, CI, tests, migrations,
  backup/restore, observability, security, docs) with targets and trend columns. ✅

### P4.3 — `/metrics` default-closed guidance  — _Status: Done (2026-06-30)_
- See tdone.md.

### P4.4 — Operational reference architecture (deployment blueprints)  — _Status: Done (2026-07-01)_
- **Files:** `docs/reference-architecture.md`.
- **Acceptance:** blueprints for (1) single VM/PM2/nginx, (2) container platform,
  (3) Kubernetes; includes worker topology, migration ordering, rollback, RTO/RPO,
  service dependency diagram, and blueprint selection guide. ✅

### P4.5 — CI gate hardening  — _Status: Pending (coverage gate decision + SAST triage pending)_
- Concurrency group added 2026-06-30; remaining: coverage-gate decision, Semgrep triage.