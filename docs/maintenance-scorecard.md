# Quarterly Maintenance Scorecard

**Quarter:** Q3 2026 (Jul – Sep)
**Last updated:** 2026-07-01
**Owner:** Platform team

Tracked trend: dependency freshness, CI health, test health, migration health,
backup/restore RTO/RPO, production latency, open security exceptions.

---

## 1. Dependency Freshness

| Metric | Current | Target | Trend |
|---|---|---|---|
| Dependencies behind latest major | _TBD_ | 0 | — |
| Dependencies behind latest patch | _TBD_ | ≤3 | — |
| Dependabot / Renovate PRs open | _TBD_ | ≤2 | — |
| Known CVEs in `bun audit --prod` | _TBD_ | 0 Critical/High | — |

**Notes:** Weekly dependency-update workflow runs Fridays; manual review of
grouped PR merges. Drizzle Kit pinned to `0.31.10` due to upstream generator
breakage.

---

## 2. CI Health

| Metric | Current | Target | Trend |
|---|---|---|---|
| CI success rate (last 30 days) | _TBD_ | ≥95% | — |
| CI median duration (main PR) | _TBD_ | <5 min | — |
| CI p95 duration | _TBD_ | <10 min | — |
| Flaky tests (failing ≥2 of last 10 runs) | _TBD_ | 0 | — |
| `verify:generated` drift failures | _TBD_ | 0 | — |

**Jobs:** `lint:ci` (Biome) · `type-check` (tsc) · `test` (Vitest, 826+ tests) ·
`verify:generated` (SDK+docs drift) · UI build · SAST (Semgrep) · Trivy filesystem

---

## 3. Test Health

| Metric | Current | Target | Trend |
|---|---|---|---|
| Total test count | _TBD_ | Growing | — |
| Unit test coverage (lines) | _TBD_ | ≥85% | — |
| Unit test coverage (branches) | _TBD_ | ≥85% | — |
| E2E smoke passing | _TBD_ | 100% | — |
| Playwright E2E passing | _TBD_ | 100% | — |
| k6 load test thresholds met | _TBD_ | p95 <100ms, p99 <300ms | — |

---

## 4. Migration Health

| Metric | Current | Target | Trend |
|---|---|---|---|
| Pending (unapplied) migrations | _TBD_ | 0 | — |
| Irreversible migrations in last quarter | _TBD_ | 0 | — |
| Migration applied with rollback tested | _TBD_ | All destructive | — |
| `db:generate` drift (`drizzle/` vs schema) | _TBD_ | No diff | — |

**Notes:** Migrations `0020`–`0024` are irreversible `DROP … CASCADE`.
Expand/contract discipline (TODO P3.5) not yet adopted.

---

## 5. Backup & Restore

| Metric | Current | Target | Trend |
|---|---|---|---|
| Last `db:backup` success | _TBD_ | <24h ago | — |
| Backup S3 upload confirmed | _TBD_ | <24h ago | — |
| Last restore drill | _TBD_ | <quarter ago | — |
| Restore RTO (time to recovered) | _TBD_ | <30 min | — |
| Restore RPO (data loss window) | _TBD_ | <1 hour | — |
| `BACKUP_REQUIRE_ENCRYPTION` set in prod | _TBD_ | `true` | — |

---

## 6. Production Observability

| Metric | Current | Target | Trend |
|---|---|---|---|
| API p95 latency | _TBD_ | <100ms | — |
| API p99 latency | _TBD_ | <300ms | — |
| Error rate (5xx / minute) | _TBD_ | <0.1% | — |
| `/healthz` uptime (30 days) | _TBD_ | ≥99.9% | — |
| SLO burn rate alerts triggered | _TBD_ | 0 | — |
| Sentry error count (30 days) | _TBD_ | Trending down | — |

---

## 7. Security Exceptions

| ID | Finding | Severity | Opened | Target fix | Status |
|---|---|---|---|---|---|
| SAST-Semgrep | CI Semgrep job red (pre-existing) | Low | 2026-06 | Q3 | Triaged |
| — | — | — | — | — | — |

**Open security items from AUDIT.md:** `/metrics` open by default unless
`METRICS_AUTH_TOKEN` set (S3). `/metrics` default-closed guidance done (P4.3);
actual gating pending per-deploy config.

---

## 8. Docs & ADR Health

| Metric | Current | Target | Trend |
|---|---|---|---|
| ADRs written for load-bearing decisions | 6 (P4.1 done) | All major | ✅ |
| Standing audit freshness | 2026-06-29 | <quarter old | ✅ |
| `verify:generated` (API reference drift) | 0 diff | 0 diff | ✅ |
| Unaddressed TODO P0 items | 0 (P0.1–P0.3 done) | 0 | ✅ |
| Unaddressed TODO P1 items | 2 (P1.1 in progress, P1.2 pending) | 0 | 🔶 |

---

## Metrics key

- ✅ = meets or exceeds target
- 🔶 = approaching threshold
- 🔴 = below target, needs action
- — = baseline (first reading)

**Next review:** 2026-10-01 (Q3 end)
