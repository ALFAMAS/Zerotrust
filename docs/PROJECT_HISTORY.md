# Project History (archived planning & audit docs)

This file consolidates the project's **dated, superseded** planning, audit, and
phase documents into one place so the live docs tree stays small and easy to
track. Each entry summarizes what the original document was, its outcome, and
where its still-relevant content lives today. Full original text is preserved in
git history at the path noted.

**Live, current docs (use these, not the archive below):**

| Topic | Canonical doc |
| --- | --- |
| Standing production-readiness audit | [`AUDIT.md`](./AUDIT.md) |
| Prioritized backlog | [`../todo.md`](../todo.md) |
| Current architecture + proposals | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Feature-removal record (2026-06-28 slim-down) | _Removed_ — see migrations `0020`–`0024` and `tdone.md` |
| Shipped-feature ledger | [`../tdone.md`](../tdone.md) |

---

## 2026-06-25 — Enterprise SaaS Starter Execution Plan
_Was: `docs/ENTERPRISE_EXECUTION_PLAN.md`_

Program-level execution ledger for the original enterprise build-out: prioritized
audit findings, owner assignments, Week 1–4 milestones, and staging-handoff
steps. **Outcome:** the Week 1–4 work shipped and is recorded in `tdone.md`; the
forward-looking items were superseded by [`AUDIT.md`](./AUDIT.md) and
[`../todo.md`](../todo.md). Predates the 2026-06-28 maintenance slim-down.

## 2026-06-25 — Phase 2: Performance & Observability
_Was: `docs/PHASE_2_PERFORMANCE_OBSERVABILITY.md` (last of the PHASE_* logs; the
other 12 were removed earlier)_

Delivered API-wide Hono compression, hot-path indexes (`0019_hot_path_indexes.sql`
for refresh-token and org-membership lookups), the mounted Prometheus `/metrics`
route, and an ops smoke script. **Outcome:** shipped; see `tdone.md`. (Note: the
compression middleware later needed a `CompressionStream` guard under Bun < 1.3 —
see `AUDIT.md` C4.)

## 2026-06-25 — Production-Readiness Audit (original whole-codebase audit)
_Was: `docs/audit/2026-06-25-production-readiness-audit.md` and its near-duplicate
`docs/PRODUCTION_READINESS_AUDIT.md`_

The first full audit (security, correctness, coverage, FE↔BE surface). Both copies
were **self-marked historical** — their scope figures ("31 route modules, 70+
services") predate the 2026-06-28 slim-down and no longer hold. **Superseded by**
[`AUDIT.md`](./AUDIT.md) (current standing audit). The feature-removal audit
doc was itself removed; see migrations `0020`–`0024` for what was slimmed out.

## 2026-06-25 — Performance sub-plan (auth/org hot path → p95 < 100 ms)
_Was: `docs/audit/D3-performance-subplan.md`_

Companion task breakdown to the audit above: eliminate write-on-every-read in
`authMiddleware` (shipped, #39), session+user single round-trip, optional Redis
user-state cache, k6 p95 capture. **Outcome:** the write-on-read fix shipped;
remaining latency work shipped in [`../tdone.md`](../tdone.md) P3
(read-replica routing, RSC prefetch, k6 baselines).

## 2026-06-28 — Production Safety TODO (failsafe CI/CD & hardening)
_Was: `docs/PRODUCTION_SAFETY_TODO.md`_

Forward-looking CI/CD and release-safety punch list. **Section A (make CI green)
shipped** — type-check, lint, and tests went green (697 passing at the time);
the magic-link `randomBytes` outage (A1) was fixed. Remaining operational items
from §B–§D were either shipped (see [`../tdone.md`](../tdone.md)) or superseded
by the standing audit; verified open work is in [`../todo.md`](../todo.md) (T5, C1).

## 2026-06-28 — SaaS Template Architecture Recommendations
_Was: `docs/SAAS_TEMPLATE_ARCHITECTURE_RECOMMENDATIONS.md`_

Benchmarked zerotrust against MakerKit / supastarter / BoxyHQ / ixartz and
recommended maintainability/stability upgrades (bounded modules, repository/
transaction layer, worker isolation + the PM2 `-i max` cluster-mode duplication
bug, plugin/capability contract for optional-heavy integrations, typed UI↔API
contracts, UI component tests, operational reference architecture, ADRs +
maintenance scorecard). **Recommendations shipped** — see [`AUDIT.md`](./AUDIT.md)
(findings) and [`../tdone.md`](../tdone.md) (shipped work catalog).
