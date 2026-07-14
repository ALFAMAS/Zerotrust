# zerotrust — TODO

## Security baseline (`docs/security.md`)

Audit date: **2026-07-05**. Verified/completed items moved to [`shipped.md`](./shipped.md) § Security baseline audit. **No open SEC items** — **DQ-2** (coverage gate alignment) shipped 2026-07-09.

---

## Production readiness (`docs/production-checklist.md`)

Audit date: **2026-07-07**. Open gaps from [`production-checklist.md`](../production-checklist.md) rows marked **Partial**, **Missing**, or **Unknown** (Done rows omitted).

**Verification (2026-07-09):** FE-1/AUTH-1 shipped → [`shipped.md`](./shipped.md) § Recent work.
New open items below come from the **2026-07-09 codebase audit**
([`codebase-audit-2026-07-09.md`](./codebase-audit-2026-07-09.md)).

---

## Open now (2026-07-13, post-#95) — work top to bottom

### Operator actions (only a repo/infra admin can do these)

- [ ] **SEC-ROT (P0, ~5 min)** — **Rotate the Neon `neon_owner` password.** A real Neon
      connection string was committed as the `drizzle.config.ts` fallback (removed in #95) and
      remains in git history of a public repo. Neon console → project → reset role password;
      update `DATABASE_URL` wherever it is deployed. Also add a connection-string rule to the
      Gitleaks config — it did not flag this.
- [ ] **PROC-1 (P0, ~5 min)** — **Apply branch protection on `main`** per
      `docs/deployment.md` § Branch protection (require the CI check, block direct pushes).
      The runbook shipped 2026-07-12 but the GitHub setting is not applied; five separate CI
      breakages this week landed because work merged while CI was red or unfinished.
- [ ] **MIG-3 (P1, operator)** — Databases historically provisioned with `db:push` lack the
      RLS tenant-isolation policies (0035/0038/0043) and audit-immutability triggers (0031).
      Apply those migrations manually (or re-baseline `__drizzle_migrations`) and verify with
      `SELECT * FROM pg_policies;` before trusting tenant isolation in that environment.

### Code (assignable to an agent)

- [x] **DQ-3 (P1)** — Coverage ratchet red after the Tier 1–5 merges diluted the ratio (lines
      63.93% vs 64%, statements 62.34% vs 63%, branches 54.53% vs 55%; all tests passed). Fixed
      in this PR by testing the two biggest untested surfaces — `scim.routes.http.test.ts`
      (SCIM Users/Groups CRUD, 18 cases) and `admin.analytics.routes.test.ts` (cohorts, auth
      mix, anomaly trends) — measured after: statements 63.76%, branches 55.89%, lines 65.26%.
- [ ] **DX-3 (P2)** — Biome 2.5.3 throws non-fatal internal panics in CI
      (`biome_module_graph … index out of bounds`) on `packages/ui/src/components/charts/*` and
      `src/db/schema/*`; the step still passes but the noise buries real diagnostics. Track the
      upstream fix (biomejs/biome) or pin back to 2.5.2 if it worsens.

### Pre-launch (operator, from [`production-checklist.md`](../production-checklist.md))

- [ ] Walk the **Pre-launch sign-off** table: production env vars, `bootstrap:admin`, TLS +
      vhosts, `WORKER_MODE` topology, backup + restore drill, staging validation
      (Lighthouse + ZAP), alerting receivers, `/metrics` auth.

---

## Codebase audit (2026-07-09) — open items

_All items from the 2026-07-09 audit backlog are shipped — see [`shipped.md`](./shipped.md) § Recent work (2026-07-10)._

## Migration integrity (2026-07-11 re-audit)

- [x] **MIG-2** — Migration chain runs green on a fresh DB and is `pg_dump`-equivalent to the code
      schema: 0017/0020 made idempotent; `0041_sync_code_schema_drift` adds columns that shipped in
      code without migrations and drops dropped-feature leftovers. Shipped 2026-07-11.

_All MIG-* items from the 2026-07-11 re-audit are shipped — see [`shipped.md`](./shipped.md) § Migration integrity._

## Deliberate toolchain migrations (unblock the pinned majors)

- [ ] **TypeScript 7** — blocked on Next.js 16.2.10: `next build` fails with
      "Failed to install required TypeScript dependencies" when `typescript@7` is
      installed (Next still expects TS ≤6). Root + `packages/ui` stay on `^6.0.3`;
      Dependabot semver-major PRs for `typescript` are labeled `needs-migration`
      (see `dependabot-label.yml`) — do not merge until Next.js documents TS7 support.
      Re-test after each Next.js minor release.

_All other deliberate toolchain migrations shipped 2026-07-12 — see [`shipped.md`](./shipped.md) § Toolchain migrations._

## Backlog (unprioritized)

**Tier 1 process guardrails (upgrade-roadmap.md):** all four items shipped 2026-07-12
(branch protection runbook, MIG-4, Dependabot label policy, PR preview compose smoke).
Deferred toolchain work (TypeScript 7) remains in Tier 2 above.

_(see [`upgrade-roadmap.md`](./upgrade-roadmap.md) for the full upgrade catalog: product-level SaaS upgrades)_

## Architecture — deferred workspace rename (upgrade-roadmap #9)

- [ ] **`apps/api` + `apps/web` rename** — deferred until a concrete driver (second app,
      mobile surface, or split deployable). Blast radius: Dockerfiles, compose, CI workflows,
      docs, and every import path. Current layout (`src/` API + `packages/ui/`) remains canonical.
