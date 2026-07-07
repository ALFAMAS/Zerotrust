# Quarterly Maintenance Scorecard

**Quarter:** Q3 2026 (Jul – Sep)
**Last updated:** 2026-07-08 (SEC-27 shipped; **DQ-2** open in [`project/todo.md`](./project/todo.md); SEC-1…SEC-27 + SEC-28 shipped — [`project/shipped.md`](./project/shipped.md))
**Owner:** Platform team

Tracked trend: dependency freshness, CI health, test health, migration health,
backup/restore RTO/RPO, production latency, open security exceptions.

---

## 1. Dependency Freshness

| Metric | Current | Target | Trend |
|---|---|---|---|
| Dependencies behind latest major | 0 (`bun outdated`) | 0 | ✅ |
| Dependencies behind latest patch | esbuild ≤0.24.2 (1 advisory) | ≤3 | ✅ |
| Dependabot / Renovate PRs open | _TBD_ | ≤2 | — |
| Known CVEs in `bun audit --prod` | 0 Critical/High (esbuild low) | 0 Critical/High | ✅ |

**Notes:** Weekly dependency-update workflow runs Fridays; manual review of
grouped PR merges. Drizzle Kit pinned to `0.31.10` due to upstream generator
breakage. Total dependencies: 64 (root + devDependencies). Runtime: Bun 1.3.14,
Node v24.15.0.

---

## 2. CI Health

| Metric | Current | Target | Trend |
|---|---|---|---|
| CI success rate (last 30 days) | **~42%** historical (Jun 3–Jul 3 burst); **remediated 2026-07-03** — `bun run lint:ci` green; forward window rebaselined | ≥95% | 🔶 |
| CI median duration (main PR) | **~3.5 min** wall-clock (run #282, 2026-07-02) | <5 min | ✅ |
| CI p95 duration | **~4.5 min** (successful runs, Jul 1–2 sample) | <10 min | ✅ |
| Flaky tests (failing ≥2 of last 10 runs) | **0** identified (failures are lint/build/schema, not test flakes) | 0 | ✅ |
| `verify:generated` drift failures | 0 (idempotent regen verified) | 0 | ✅ |

**Notes (B6, 2026-07-03):** Root-cause triage identified deterministic Biome format/import
drift (not flaky tests) during the Jul 2 refactor burst. Remediation applied to
`src/worker.ts`, `src/api/routes/auth.routes.ts`, `src/jobs/scheduler.ts`,
`packages/ui/src/lib/apiClient.ts`, `packages/ui/src/lib/reverification.ts`,
`packages/ui/src/lib/server-state/prefetch.ts`, and
`packages/ui/src/components/ReverificationProvider.tsx`. Evidence:
[`ci-health/2026-07-03-ci-recovery.md`](./compliance/evidence/2026/Q3/ci-health/2026-07-03-ci-recovery.md).
Rolling 30-day success rate reaches ≥95% as green runs accumulate post-remediation.

**Jobs:** `lint:ci` (Biome) · `type-check` (tsc) · `test` (Vitest, 1003 API tests) ·
`test:coverage:ui` (UI ratchet) · `test:coverage` (API ratchet) ·
`migrations:check` (destructive DDL gate) · `verify:generated` (SDK+docs drift) · UI build · SAST (Semgrep, blocking) · Trivy filesystem (blocking, `trivy-action@0.35.0`)

---

## 3. Test Health

| Metric | Current | Target | Trend |
|---|---|---|---|
| Total test count | 1003 API + 239 UI = **1242** (181 files) | Growing | ✅ |
| API unit test coverage (lines) | **67.41%** measured; ≥67% ratchet (`vitest.config.ts`) | ≥85% long-term | 🔶 ↑ |
| API unit test coverage (branches) | **60.02%** measured; ≥60% ratchet | ≥85% long-term | 🔶 ↑ |
| UI page/component coverage (lines) | **54.59%** measured; ≥54% ratchet on `packages/ui` app/components/lib | ≥85% long-term | 🔶 ↑ |
| Page-level component tests | 27 `.test.tsx` under `packages/ui/src/app/` + client splits (organizations, settings, invite, access-reviews + prior pages) | High-traffic flows covered | ✅ |
| E2E smoke passing | 6 Playwright specs (auth, public, dashboard-polish, wallet, webhooks, security) | 100% | ✅ |
| Playwright E2E passing | 6 specs in CI `e2e-ui` job | 100% | ✅ |
| k6 load test thresholds met | CI `load-test` job: p95 &lt;100ms, p99 &lt;300ms (`full-suite.k6.js`) | p95 &lt;100ms, p99 &lt;300ms | ✅ |

**Notes (T5 shipped, 2026-07-04):** Added `queryKeys.test.ts` (root suite) and
expanded `SecurityClient` page tests (TOTP verify/disable, OAuth, passkeys).
API floors raised to 67/66/60/65; UI floors to 54/52/46/51. CI now runs
`bun run test:coverage:ui` as a blocking gate. All **239 UI tests** green;
measured API 67.41% lines / 60.02% branches; UI 54.59% lines.

**Notes (T5 increment, 2026-07-04):** Fixed 13 UI failures caused by P3.11 async
RSC `page.tsx` wrappers — server-state tests now render `*Client` components.
Added `plans.test.ts` and extended `apiHelpers.test.ts` (canonical shared
modules). API statements floor raised 64→**65**; UI branches floor 45→**46**.
All **232 UI tests** green; measured API 66.60% lines / 59.74% branches.

**Notes (T5 increment, 2026-07-03):** API ratchet raised after targeted tests for
canonical shared modules (`pagination.ts`, `permissions.ts`, `locale.ts`,
`clientIp.ts`, `usageMetering.ts` — 30 tests) and UI page/client coverage
(`OrganizationsClient`, `SettingsClient`, invite accept, admin access-reviews —
12 tests). UI floors unchanged (53/51/45/51); 13 pre-existing failures in
`auth.test.tsx`, `organizations.test.tsx`, and `security/page.test.tsx` block a
UI ratchet raise until triaged.

**Notes (B4, 2026-07-03):** Coverage ratchet raised alongside targeted tests for
previously-undertested hot paths — `src/jobs/scheduler.ts` (BullMQ job-scheduler
registration, idempotent replay, failure recovery; 15 tests), the billing webhook
processor `stripeWebhookProcessor.ts` (31%→93% line coverage; 12 tests covering
every event-type branch), and `authMiddleware`/`optionalAuthMiddleware` branch
coverage (56%→93% line coverage; 17 tests covering expired/revoked sessions, org
policy rejection, concurrent-session eviction, suspended/deleted accounts).

---

## 4. Migration Health

| Metric | Current | Target | Trend |
|---|---|---|---|
| Pending (unapplied) migrations | 0 (latest: `0040_session_active_org_id`) | 0 | ✅ |
| Irreversible migrations in last quarter | 5 (`0020`–`0024`, DROP CASCADE) — gated by `.destructive-migrations.json` + CI | 0 new without allowlist | ✅ |
| Migration applied with rollback tested | 2026-07-03 restore drill ([evidence](./compliance/evidence/2026/Q3/backup-restore-drills/2026-07-03-restore-drill.md)) | All destructive | ✅ |
| `db:generate` drift (`drizzle/` vs schema) | 0 (verified locally 2026-07-03) | No diff | ✅ |

**Notes:** Migrations `0020`–`0024` are irreversible `DROP … CASCADE`, allowlisted in
`.destructive-migrations.json`. New destructive DDL is blocked by `bun run migrations:check`
(CI + pre-commit). Total migrations: 41 (`0000`–`0040`).

---

## 5. Backup & Restore

| Metric | Current | Target | Trend |
|---|---|---|---|
| Last `db:backup` success | _TBD_ (no prod deploy yet) | <24h ago | — |
| Backup S3 upload confirmed | _TBD_ | <24h ago | — |
| Last restore drill | 2026-07-03 ([Q3 drill](./compliance/evidence/2026/Q3/backup-restore-drills/2026-07-03-restore-drill.md)) | <quarter ago | ✅ |
| Restore RTO (time to recovered) | _TBD_ (no prod deploy yet) | <30 min | — |
| Restore RPO (data loss window) | _TBD_ (no prod deploy yet) | <1 hour | — |
| `BACKUP_REQUIRE_ENCRYPTION` enforced in prod | Yes (P4.3 fail-fast gate) | `true` | ✅ |

**Notes:** P4.3 now enforces `BACKUP_REQUIRE_ENCRYPTION=true` and
`BACKUP_ENCRYPTION_KEY_HEX` at boot when `NODE_ENV=production` (unless
`BACKUP_ENABLED=false`). Backup runbook: `docs/compliance/backup-restore-runbook.md`.

---

## 6. Production Observability

| Metric | Current | Target | Trend |
|---|---|---|---|
| API p95 latency | CI k6 baseline: **&lt;100ms** (`http_req_duration` p95) | &lt;100ms | ✅ |
| API p99 latency | CI k6 baseline: **&lt;300ms** (`http_req_duration` p99) | &lt;300ms | ✅ |
| Error rate (5xx / minute) | _TBD_ | <0.1% | — |
| `/healthz` uptime (30 days) | _TBD_ | ≥99.9% | — |
| SLO burn rate alerts triggered | _TBD_ | 0 | — |
| Sentry error count (30 days) | _TBD_ | Trending down | — |

**Notes:** SLO service (`src/services/ops/slo.service.ts`) and Prometheus
`/metrics` endpoint are wired. Production latency metrics require a live deploy
with the scrape config from the reference architecture. k6 load tests
(`tests/load/`) enforce p95 &lt;100ms / p99 &lt;300ms in CI (`load-test` job);
see `tests/load/full-suite.k6.js` thresholds.

---

## 7. Security Exceptions

| ID | Finding | Severity | Opened | Target fix | Status |
|---|---|---|---|---|---|
| — | _No open security exceptions_ | — | — | — | — |

**Closed (P4.7):** SAST-Semgrep — was triaged Low (2026-06); verified green on
`main` CI run 28624304093 (2026-07-02). `p/owasp-top-ten` passes with zero
blocking findings.

**Metrics gate (P4.2):** `/metrics` gate — **Fixed**.
Production boot requires `METRICS_AUTH_TOKEN`; reference architecture documents
token-gated scrape configs.

**Security baseline ([`docs/security.md`](./security.md)):** **0 open** SEC items; **DQ-2**
(coverage ratchet) remains in [`project/todo.md`](./project/todo.md). SEC-1…SEC-27 shipped
(SEC-27 2026-07-08); SEC-28 documented out-of-scope. CWE hardening (601/918/78/22/532/1333/327/1427/79)
tracked in `CLAUDE.md` / `AGENTS.md` — do not duplicate as SEC items.

---

## 8. Docs health

| Metric | Current | Target | Trend |
|---|---|---|---|
| `verify:generated` (API reference drift) | 0 diff | 0 diff | ✅ |
| Unaddressed TODO P0 items | 0 (P0.1–P0.3 done) | 0 | ✅ |
| Unaddressed TODO P1 items | 0 (P1.1–P1.5 done) | 0 | ✅ |
| Unaddressed TODO P4 items | 0 (P4.1–P4.9 done) | 0 | ✅ |
| Open backlog (B6–B7) | 0 (P3 Operations & compliance shipped) | 0 | ✅ |
| P1 security & access control gaps | 0 (B1, B3, ALFA-3 done) | 0 | ✅ |
| P2 infrastructure backlog | 0 (B4, B5 done) | 0 | ✅ |
| Open product backlog ([`project/todo.md`](./project/todo.md)) | **1** (DQ-2) | Trending down | 🔶 |
| Security baseline gaps ([`docs/security.md`](./security.md) §0–§10) | **0 open** SEC items; SEC-1…SEC-27 shipped (SEC-27 2026-07-08) | 0 | ✅ |

---

## Metrics key

- ✅ = meets or exceeds target
- 🔶 = approaching threshold
- 🔴 = below target, needs action
- — = baseline (first reading)

**Next review:** 2026-10-01 (Q3 end)
