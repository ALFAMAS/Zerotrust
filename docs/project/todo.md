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
