# Quarterly Maintenance Scorecard

**Quarter:** Q3 2026 (Jul – Sep)
**Last updated:** 2026-07-03 (P3 scalability baseline)
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
| CI success rate (last 30 days) | _TBD_ (no metrics pipeline yet) | ≥95% | — |
| CI median duration (main PR) | _TBD_ | <5 min | — |
| CI p95 duration | _TBD_ | <10 min | — |
| Flaky tests (failing ≥2 of last 10 runs) | _TBD_ | 0 | — |
| `verify:generated` drift failures | 0 (idempotent regen verified) | 0 | ✅ |

**Jobs:** `lint:ci` (Biome) · `type-check` (tsc) · `test` (Vitest, 864+ API tests) ·
`migrations:check` (destructive DDL gate) · `verify:generated` (SDK+docs drift) · UI build · SAST (Semgrep) · Trivy filesystem

---

## 3. Test Health

| Metric | Current | Target | Trend |
|---|---|---|---|
| Total test count | 870 API + 195 UI = **1065** (152 files) | Growing | ✅ |
| API unit test coverage (lines) | **64.2%** measured; ≥63% ratchet (`vitest.config.ts`) | ≥85% long-term | 🔶 ↑ |
| API unit test coverage (branches) | **56.3%** measured; ≥56% ratchet | ≥85% long-term | 🔶 ↑ |
| UI page/component coverage (lines) | **~42%** ratchet on `packages/ui` app/components/lib | ≥85% long-term | 🔶 ↑ |
| Page-level component tests | 15 `.test.tsx` under `packages/ui/src/app/` (dashboard, profile, security, org settings, admin overview, compliance, regions, auth, billing) | High-traffic flows covered | ✅ |
| E2E smoke passing | _TBD_ | 100% | — |
| Playwright E2E passing | _TBD_ | 100% | — |
| k6 load test thresholds met | _TBD_ | p95 <100ms, p99 <300ms | — |

---

## 4. Migration Health

| Metric | Current | Target | Trend |
|---|---|---|---|
| Pending (unapplied) migrations | 0 (latest: `0029_points_ledger`) | 0 | ✅ |
| Irreversible migrations in last quarter | 5 (`0020`–`0024`, DROP CASCADE) — gated by `.destructive-migrations.json` + CI | 0 new without allowlist | ✅ |
| Migration applied with rollback tested | _TBD_ (DR drill pending) | All destructive | — |
| `db:generate` drift (`drizzle/` vs schema) | _TBD_ | No diff | — |

**Notes:** Migrations `0020`–`0024` are irreversible `DROP … CASCADE`, allowlisted in
`.destructive-migrations.json`. New destructive DDL is blocked by `bun run migrations:check`
(CI + pre-commit). Total migrations: 29.

---

## 5. Backup & Restore

| Metric | Current | Target | Trend |
|---|---|---|---|
| Last `db:backup` success | _TBD_ (no prod deploy yet) | <24h ago | — |
| Backup S3 upload confirmed | _TBD_ | <24h ago | — |
| Last restore drill | _TBD_ (runbook exists, drill pending) | <quarter ago | — |
| Restore RTO (time to recovered) | _TBD_ | <30 min | — |
| Restore RPO (data loss window) | _TBD_ | <1 hour | — |
| `BACKUP_REQUIRE_ENCRYPTION` enforced in prod | Yes (P4.3 fail-fast gate) | `true` | ✅ |

**Notes:** P4.3 now enforces `BACKUP_REQUIRE_ENCRYPTION=true` and
`BACKUP_ENCRYPTION_KEY_HEX` at boot when `NODE_ENV=production` (unless
`BACKUP_ENABLED=false`). Backup runbook: `docs/compliance/backup-restore-runbook.md`.

---

## 6. Production Observability

| Metric | Current | Target | Trend |
|---|---|---|---|
| API p95 latency | _TBD_ (no prod deploy yet) | <100ms | — |
| API p99 latency | _TBD_ | <300ms | — |
| Error rate (5xx / minute) | _TBD_ | <0.1% | — |
| `/healthz` uptime (30 days) | _TBD_ | ≥99.9% | — |
| SLO burn rate alerts triggered | _TBD_ | 0 | — |
| Sentry error count (30 days) | _TBD_ | Trending down | — |

**Notes:** SLO service (`src/services/ops/slo.service.ts`) and Prometheus
`/metrics` endpoint are wired. Production latency metrics require a live deploy
with the scrape config from the reference architecture. k6 load tests
(`tests/load/`) define the thresholds.

---

## 7. Security Exceptions

| ID | Finding | Severity | Opened | Target fix | Status |
|---|---|---|---|---|---|
| SAST-Semgrep | CI Semgrep job red (pre-existing) | Low | 2026-06 | Q3 | Triaged |
| — | — | — | — | — | — |

**Open security items from AUDIT.md:** `/metrics` is open by default unless
`METRICS_AUTH_TOKEN` is set (S3). P4.2 shipped: deployment checklist now
**requires** `METRICS_AUTH_TOKEN` in production, and the reference architecture
documents token-gated scrape configs for both Kubernetes (ServiceMonitor +
bearer secret) and VM/PM2 (`prometheus.yml` + `credentials_file`). Per-deploy
enforcement is an operational responsibility; the scorecard tracks open
ungated `/metrics` exceptions to zero.

---

## 8. Docs & ADR Health

| Metric | Current | Target | Trend |
|---|---|---|---|
| ADRs written for load-bearing decisions | 7 (001–007) | All major | ✅ |
| Standing audit freshness | 2026-07-03 | <quarter old | ✅ |
| `verify:generated` (API reference drift) | 0 diff | 0 diff | ✅ |
| Unaddressed TODO P0 items | 0 (P0.1–P0.3 done) | 0 | ✅ |
| Unaddressed TODO P1 items | 0 (P1.1–P1.5 done) | 0 | ✅ |
| Unaddressed TODO P4 items | 0 (P4.1–P4.5 done) | 0 | ✅ |

---

## Metrics key

- ✅ = meets or exceeds target
- 🔶 = approaching threshold
- 🔴 = below target, needs action
- — = baseline (first reading)

**Next review:** 2026-10-01 (Q3 end)
