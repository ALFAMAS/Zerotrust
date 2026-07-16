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

From the supplemental
[`production-readiness-audit-2026-07-15.md`](./production-readiness-audit-2026-07-15.md)
(MKT-1 and JIT-1 shipped same day):

- [x] **MFA-SMS-1 (P1)** — Shipped 2026-07-15: the SMS OTP toggle is hidden in
      Admin → Auth Settings until an SMS delivery provider is wired (the inert
      `smsOtpEnabled` API flag is retained for forward compatibility).
- [x] **BILL-PRICE-1 (P2)** — Shipped 2026-07-15: `packages/ui/src/config/pricing.ts`
      is the single display-price source (env-overridable via
      `NEXT_PUBLIC_PLAN_*_PRICE_MONTHLY`), consumed by `/pricing`, the landing
      teaser, and the billing dashboard (Enterprise now shows the same price).

Earlier 2026-07-15 audit items (CI-4, PERF-3, E2E-2, DX-4, STR-5) were verified locally and moved
to [`shipped.md`](./shipped.md). A new remote `main` run and staging latency measurements remain
part of the operator pre-launch sign-off below.

### Operator actions (only a repo/infra admin can do these)

Code-side prerequisites for each item are complete; the checkboxes below remain
open until an operator performs the live action.

- [ ] **OPS-ENV-1 (P0, operator)** — GitHub API verification on 2026-07-15 (re-checked
      2026-07-16) found no `staging` or `production` environment and no repository
      Actions secrets or variables. Before a deployment, create protected environments
      with the intended reviewers; configure the documented `STAGING_SSH_*` /
      `PRODUCTION_SSH_*` secrets, `METRICS_AUTH_TOKEN`, and public
      `STAGING_*_URL` / `PRODUCTION_*_URL` variables. The deploy workflows are otherwise
      safe no-ops, so this is a release configuration blocker rather than a
      repository-code defect.
      **Code prerequisite (2026-07-16):** `bun run deploy-env:check` verifies environment
      scaffolding (existence + production required reviewers) without reading secret
      values; runbook in `docs/deployment.md` § OPS-ENV-1.
- [ ] **SEC-ROT (P0, ~5 min)** — **Rotate the Neon `neon_owner` password.** A real Neon
      connection string was committed as the `drizzle.config.ts` fallback (removed in #95) and
      remains in git history of a public repo. Neon console → project → reset role password;
      update `DATABASE_URL` wherever it is deployed. Repository-side scanner hardening shipped
      2026-07-15 (`.gitleaks.toml` + CI); only the credential rotation remains — no further
      code change can revoke the historically published password.

~~MIG-3~~ shipped 2026-07-16 — see [`shipped.md`](./shipped.md) § MIG-3. Script applies
`0031`/`0035`/`0036`/`0038`/`0043`, verifies RLS + audit triggers; local/dev DB baselined.
Other legacy `db:push` environments: one-liner in [`deployment.md`](../deployment.md) § MIG-3.

### Pre-launch (operator, from [`production-checklist.md`](../production-checklist.md))

- [ ] Walk the **Pre-launch sign-off** table: production env vars, `bootstrap:admin`, TLS +
      vhosts, `WORKER_MODE` topology, backup + restore drill, staging validation
      (Lighthouse + ZAP), alerting receivers, `/metrics` auth.

## Backlog (unprioritized)

**Tier 1 process guardrails (upgrade-roadmap.md):** all four items shipped 2026-07-12
(branch protection runbook, MIG-4, Dependabot label policy, PR preview compose smoke).
Deferred toolchain work (TypeScript 7) remains in Tier 2 above.

_(see [`upgrade-roadmap.md`](./upgrade-roadmap.md) for the full upgrade catalog: product-level SaaS upgrades)_
