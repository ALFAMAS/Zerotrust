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

- [ ] **Tailwind v4** — migrate `postcss.config.js`/`tailwind.config.js`/`globals.css`
      (`@tailwindcss/postcss`, CSS-first config), then drop the Dependabot ignore.
- [ ] **TypeScript 7** — adopt once Next.js supports the native compiler; drop pin + ignore.
- [ ] **k6 v2** — validate `tests/load/*.k6.js` against v2, then unpin the apt install in `ci.yml`.
- [ ] **Branch protection / merge queue on `main`** — direct pushes repeatedly landed red
      (tailwind v4 bump, TS7 bump, stale lockfile); require CI before merge.

## Backlog (unprioritized)

_(see [`upgrade-roadmap.md`](./upgrade-roadmap.md) for the full upgrade catalog: `apps/*` workspace
rename, `packages/shared-types`, `deploy/k8s/`, product-level SaaS upgrades)_
