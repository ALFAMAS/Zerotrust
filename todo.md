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

### P0.1 — Stripe webhook idempotency  — _Status: Done (2026-06-29)_
- **Why:** Stripe delivers at-least-once; without a processed-event record a
  retry or replayed-but-valid event reprocesses subscription mutations
  (double-apply on the money path — checklist #94).
- **Files:** `src/db/schema.ts`, `drizzle/0025_burly_mindworm.sql`,
  `src/db/repositories/stripeEvents.repository.ts`,
  `src/api/routes/billing.webhooks.ts`, `src/__tests__/stripeEvents.repository.test.ts`.
- **Acceptance:** new `processed_stripe_events` table; handler claims each event
  id (`INSERT … ON CONFLICT DO NOTHING`) before applying and skips duplicates;
  claim released if processing throws so retries reprocess; unit tests green. ✅
- **Risk:** Low (additive table + early-return; no behavior change for new events).

### P0.2 — Fix `compress()` 500 under Bun < 1.3  — _Status: Done (2026-06-29)_
- **Why:** Hono's `compress()` needs the global `CompressionStream`, absent in
  Bun 1.2.23 (`.bun-version`, used by CI + dev), so every compressible response
  threw `ReferenceError: CompressionStream is not defined` → HTTP 500. This is
  what kept the Playwright E2E smoke red (pre-existing on `main`).
- **Files:** `src/api/server.ts`.
- **Acceptance:** mount `compress()` only when `"CompressionStream" in globalThis`;
  compression still runs on Node 18+ / Bun ≥ 1.3; E2E login flow returns 200. ✅
- **Risk:** Low (guarded mount; behavior unchanged where the global exists).

### P0.3 — Idempotency for the remaining event consumers  — _Status: Pending_
- **Why:** Email-event webhooks (`/webhooks/email`), SSF (`/ssf/events`), and
  user-defined webhook deliveries verify signatures but don't persist a
  processed-event id, so a valid replay is reprocessed (AUDIT S2).
- **Files:** `src/api/routes/email-events.routes.ts`, `src/ssf/receiver.ts`,
  `src/webhooks/delivery.ts`, `src/db/schema.ts`, `src/db/repositories/`.
- **Acceptance:** each consumer records and checks an idempotency key (provider
  event id where available, otherwise a content hash); replays are a no-op;
  tests cover the duplicate path.
- **Risk:** Medium (touches multiple ingress paths; keep per-consumer keys distinct).

### P0.4 — Require CI on `main` + block direct pushes  — _Status: Pending (repo setting)_
- **Why:** Formatting / generated-output drift must not land outside PR gates.
- **Files:** GitHub branch-protection settings (not in-repo).
- **Acceptance:** `main` requires PR + green `lint:ci`, `type-check`, `test`,
  `verify:generated`, UI build; direct pushes blocked.
- **Risk:** Low. **Manual:** repo admin action.

## P1 — Stability and correctness

### P1.1 — Repository + transaction layer for hot-path writes  — _Status: In Progress_
- **Why:** Only 2 files use `db.transaction`; refresh-token rotation, session
  lifecycle, billing, wallet/points ledger, and org role transitions run as
  loose statements — a crash mid-sequence leaves partial state (AUDIT C1/M1).
- **Files:** `src/db/repositories/*` (seeded with `stripeEvents.repository.ts`),
  `src/services/token.service.ts`, `src/services/wallet.service.ts`,
  `src/services/points.service.ts`, `src/audit/chain.ts`, `src/api/routes/org.routes.ts`.
- **Acceptance:** each hot-path mutation lives behind a repository method that
  wraps multi-statement writes in `db.transaction`; token-reuse detection and
  ledger appends are atomic; unit tests assert rollback on failure.
- **Risk:** High (touches auth/billing core — land incrementally, one domain per PR).

### P1.2 — Centralized background-jobs module (+ fix cluster-mode duplication)  — _Status: Pending_
- **Why:** The BullMQ consumer and the four 24h schedulers (retention,
  notification fallback, billing lifecycle, `pg_dump` backup) start
  unconditionally in the HTTP process with no instance guard. Under PM2 cluster
  mode (`-i max`) **every** instance runs them → N nightly backups + duplicate
  dunning emails. They are also plain `setInterval`s with no registry, retry,
  dead-letter, or idempotency (AUDIT C3/P1).
- **Files:** new `src/jobs/` (or `src/worker.ts`), `src/api/server.ts`,
  `src/services/emailQueue.ts`, `src/services/dataRetention.ts`,
  `src/services/billingLifecycle.service.ts`, `src/services/dbBackup.service.ts`,
  `src/services/notificationEmailFallback.ts`.
- **Acceptance:** extract a single-instance worker (or guard each scheduler with a
  Redis lock / leader election); job names + Zod payload schemas, retry/backoff,
  dead-letter, idempotency-key convention; queue/job health surfaced in `/metrics`.
- **Risk:** High (changes runtime scheduling — feature-flag the cutover).

### P1.3 — End-to-end test for billing-webhook idempotency  — _Status: Pending_
- **Why:** The repository is unit-tested; the full handler path (signature →
  claim → skip duplicate → release on error) is not (AUDIT T2).
- **Files:** `src/__tests__/billing.webhooks.test.ts` (new).
- **Acceptance:** mocked Stripe `constructEvent` + db; first delivery applies,
  second identical delivery returns `{ duplicate: true }` without re-mutating;
  thrown processing releases the claim.
- **Risk:** Low (test-only).

## P2 — Maintainability and refactoring

### P2.1 — Type the Stripe / webhook payloads  — _Status: Pending_
- **Why:** `event: any` end-to-end means a Stripe shape change fails at runtime,
  not compile time (AUDIT C2); part of the 213 `as any` in `src/` (M2).
- **Files:** `src/api/routes/billing.webhooks.ts`, `src/api/routes/billing.routes.ts`.
- **Acceptance:** use Stripe's typed `Stripe.Event` / discriminated `event.type`
  narrowing; remove `as any` from the webhook handler; type-check stays green.
- **Risk:** Medium (must preserve exact runtime behavior).

### P2.2 — Module boundaries + import-linter  — _Status: Pending_
- **Why:** No enforced partition (`identity`/`tenancy`/`billing`/`compliance`/
  `ops`/`integrations`); cross-domain coupling grows silently (AUDIT M3).
- **Files:** `biome.json` or a CI lint script, `docs/adr/`, `src/**`.
- **Acceptance:** documented dependency direction (ADR) + a CI check that fails
  when a route reaches across unrelated domains or a service imports another
  domain's internals directly.
- **Risk:** Medium (may surface existing violations to fix first).

### P2.3 — Typed UI→API contract enforcement  — _Status: Pending_
- **Why:** 11 raw `fetch()` calls remain in `packages/ui` instead of the
  generated SDK / `apiClient` wrapper; drift between UI and `openapi.json` is
  undetected.
- **Files:** `packages/ui/src/app/**`, `packages/ui/src/components/**`,
  `packages/ui/src/lib/apiClient.ts`, CI lint script.
- **Acceptance:** lint blocks ad-hoc `fetch()` to backend routes; contract test
  asserts UI pages only call routes present in `src/api/openapi.json`.
- **Risk:** Low–Medium.

## P3 — Scalability and performance

### P3.1 — UI component / integration tests  — _Status: Pending_
- **Why:** No React/page tests; auth/billing/admin flows can regress silently
  (AUDIT T1).
- **Files:** `packages/ui/vitest.config.ts` (new), `packages/ui/src/**/*.test.tsx`.
- **Acceptance:** happy-dom/Testing-Library project; tests for login/register/
  reset/MFA, org role/invite forms, billing/plan gates, admin tables.
- **Risk:** Low.

### P3.2 — Default read-heavy endpoints to the read replica  — _Status: Pending_
- **Why:** `getReadDb()` exists but is opt-in; list/admin/analytics still hit
  the primary (AUDIT P3).
- **Files:** admin/list/search routes and their services.
- **Acceptance:** read-only list/analytics handlers use `getReadDb()`; no writes
  routed to the replica; behavior unchanged when no replica is configured.
- **Risk:** Low.

### P3.3 — Offload heavy webhook work to the queue  — _Status: Pending_
- **Why:** `checkout.session.completed` calls the Stripe API in the request path
  (AUDIT P2); fine now, a bottleneck at volume.
- **Files:** `src/api/routes/billing.webhooks.ts`, `src/jobs/` (after P1.2).
- **Acceptance:** webhook records + enqueues; a worker performs `retrieve` +
  DB writes idempotently.
- **Risk:** Medium (depends on P1.2).

### P3.4 — Plugin/capability contract for optional-heavy integrations  — _Status: Pending_
- **Why:** Optional-but-heavy capabilities are always-on, which is the
  maintenance tax that motivated the 2026-06-28 slim-down. Give them an explicit
  plugin contract so they enable per-deployment without bloating default/dev
  runtime. (Carried over from the archived architecture recommendations.)
- **Files:** new `src/plugins/` contract; `src/services/search.service.ts`
  (Elasticsearch/SIEM), `src/services/*` OTP channels (Twilio SMS/WhatsApp/
  Telegram), `src/services/objectStorage.service.ts` (S3/B2/R2/MinIO),
  `src/services/globalization.service.ts` (tax/PPP providers).
- **Acceptance:** each plugin publishes config schema, health check, migrations,
  fixtures, admin-UI registration, and failure-mode docs; a future SSO/directory
  add-on re-enters through this contract rather than always-on code.
- **Risk:** Medium.

### P3.5 — Deploy & release safety (expand/contract, rollback, DR drills)  — _Status: Pending_
- **Why:** Migrations `0020`–`0024` are irreversible `DROP TABLE … CASCADE` /
  `DROP COLUMN`; there is no documented one-command rollback or periodic restore
  drill, and destructive schema changes ship without expand/contract. (Carried
  over from the archived Production Safety TODO §B.)
- **Files:** `docs/deployment.md`, `docs/compliance/backup-restore-runbook.md`,
  `docs/compliance/incident-response-runbook.md`, future migration workflow.
- **Acceptance:** verify a `db:backup` before destructive migrations + apply on a
  staging replica first; document a one-command app rollback; schedule + record a
  restore drill; adopt expand/contract for future destructive changes; confirm
  `BACKUP_REQUIRE_ENCRYPTION=true` and `BACKUP_ENCRYPTION_KEY_HEX` set in prod.
- **Risk:** Medium (process + ops; mostly docs/runbooks).

## P4 — Documentation and developer experience

### P4.1 — ADRs for load-bearing decisions  — _Status: Pending_
- **Why:** No ADRs for PASETO vs JWT, monolith vs split API, Drizzle as source
  of truth, Redis/BullMQ queues, generated-SDK workflow, token storage,
  module-boundary strategy (AUDIT D2).
- **Files:** `docs/adr/*.md`.
- **Acceptance:** one ADR per decision (context / decision / consequences).
- **Risk:** Low.

### P4.2 — Quarterly maintenance scorecard  — _Status: Pending_
- **Why:** No tracked trend for dependency freshness, CI duration, flaky tests,
  migration health, restore RTO/RPO, p95 latency, open security exceptions.
- **Files:** `docs/maintenance-scorecard.md`.
- **Acceptance:** a template + the first filled-in quarter.
- **Risk:** Low.

### P4.3 — `/metrics` default-closed guidance  — _Status: Pending_
- **Why:** `/metrics` is open unless `METRICS_AUTH_TOKEN` is set; a public
  deploy leaks internal labels (AUDIT S3).
- **Files:** `.env.example`, `docs/deployment.md`, `README.md`.
- **Acceptance:** deployment docs flag `METRICS_AUTH_TOKEN` as required for
  internet-facing deploys; `.env.example` calls it out.
- **Risk:** Low.

### P4.4 — Operational reference architecture (deployment blueprints)  — _Status: Pending_
- **Why:** `docs/deployment.md` covers local/staging; production buyers need a
  target operating model. (Carried over from the archived architecture
  recommendations.)
- **Files:** `docs/deployment.md` or new `docs/reference-architecture.md`.
- **Acceptance:** blueprints for (1) single VM/PM2/nginx, (2) container platform
  with managed Postgres/Redis/object storage, (3) Kubernetes with separate
  web/API/workers; include worker topology, migration ordering, rollback, backup
  restore RTO/RPO, and a service dependency diagram.
- **Risk:** Low (docs).

### P4.5 — CI gate hardening  — _Status: Pending_
- **Why:** Beyond branch protection (P0.4): the 85% coverage check is
  non-blocking, and there's no run-cancellation concurrency group. (Carried over
  from the archived Production Safety TODO §C/§D.)
- **Files:** `.github/workflows/ci.yml`, PR template / `CONTRIBUTING`.
- **Acceptance:** decide whether coverage should block; keep `bun audit --prod`
  + Semgrep/Trivy blocking with per-release triage; add a `concurrency` group to
  cancel superseded runs; document the "re-run generators before push" rule.
- **Risk:** Low.

---

## Recently completed (see `tdone.md` for the full ledger)

- ✅ Toolchain repair — platform native binaries (`@rolldown/binding-linux-x64-gnu`,
  `@esbuild/linux-x64`) so the full suite runs locally (2026-06-29).
- ✅ Pagination standardization — `src/shared/pagination.ts` across 15+ endpoints.
- ✅ Release reproducibility — pinned Biome/drizzle-kit, `verify:generated` drift
  gate, scheduled dependency-update workflow.
