# zerotrust — TODO

## Security baseline (`docs/security.md`)

Audit date: **2026-07-05**. Verified/completed items moved to [`shipped.md`](./shipped.md) § Security baseline audit. **No open SEC items** — **DQ-2** (coverage gate alignment) shipped 2026-07-09.

---

## Production readiness (`docs/production-checklist.md`)

Audit date: **2026-07-07**. Open gaps from [`production-checklist.md`](../production-checklist.md) rows marked **Partial**, **Missing**, or **Unknown** (Done rows omitted).

**Verification (2026-07-09):** FE-1/AUTH-1 shipped → [`shipped.md`](./shipped.md) § Recent work.
The current assignable backlog comes from the **2026-07-15 codebase audit**
([`codebase-audit-2026-07-15.md`](./codebase-audit-2026-07-15.md)); the prior audit remains at
[`codebase-audit-2026-07-09.md`](./codebase-audit-2026-07-09.md).

---

## Open now (2026-07-15) — work top to bottom

### Code (assignable to an agent)

No open repository-owned items from the 2026-07-15 audit. CI-4, PERF-3, E2E-2, DX-4, and STR-5
were verified locally and moved to [`shipped.md`](./shipped.md). A new remote `main` run and staging
latency measurements remain part of the operator pre-launch sign-off below.

### Operator actions (only a repo/infra admin can do these)

- [ ] **OPS-ENV-1 (P0, operator)** — GitHub API verification on 2026-07-15 found no `staging` or
      `production` environment and no repository Actions secrets or variables. Before a deployment,
      create protected environments with the intended reviewers; configure the documented
      `STAGING_SSH_*` / `PRODUCTION_SSH_*` secrets, `METRICS_AUTH_TOKEN`, and public
      `STAGING_*_URL` / `PRODUCTION_*_URL` variables. The deploy workflows are otherwise safe
      no-ops, so this is a release configuration blocker rather than a repository-code defect.
- [ ] **SEC-ROT (P0, ~5 min)** — **Rotate the Neon `neon_owner` password.** A real Neon
      connection string was committed as the `drizzle.config.ts` fallback (removed in #95) and
      remains in git history of a public repo. Neon console → project → reset role password;
      update `DATABASE_URL` wherever it is deployed. Repository-side scanner hardening shipped
      2026-07-15; only the credential rotation remains.
- [ ] **MIG-3 (P1, operator)** — Databases historically provisioned with `db:push` lack the
      RLS tenant-isolation policies (0035/0038/0043) and audit-immutability triggers (0031).
      Apply those migrations manually (or re-baseline `__drizzle_migrations`) and verify with
      `SELECT * FROM pg_policies;` before trusting tenant isolation in that environment.

### Pre-launch (operator, from [`production-checklist.md`](../production-checklist.md))

- [ ] Walk the **Pre-launch sign-off** table: production env vars, `bootstrap:admin`, TLS +
      vhosts, `WORKER_MODE` topology, backup + restore drill, staging validation
      (Lighthouse + ZAP), alerting receivers, `/metrics` auth.

## Backlog (unprioritized)

**Tier 1 process guardrails (upgrade-roadmap.md):** all four items shipped 2026-07-12
(branch protection runbook, MIG-4, Dependabot label policy, PR preview compose smoke).
Deferred toolchain work (TypeScript 7) remains in Tier 2 above.

_(see [`upgrade-roadmap.md`](./upgrade-roadmap.md) for the full upgrade catalog: product-level SaaS upgrades)_
