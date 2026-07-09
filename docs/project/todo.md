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

### Data / migrations

### Dependencies

### Structure (phased plan in audit doc § File-structure change plan)

- [ ] **STR-1 (P2)** — Regroup flat `scripts/` into `ops/`, `codegen/`, `ci/`, `smoke/`, `windows/`
      (update package.json scripts, workflows, knip globs in the same commit).
- [ ] **STR-2 (P2)** — Consolidate `src/jit`, `src/ssf`, `src/webhooks` (± `notifications`, `mfa`)
      under `src/modules/`; update `.boundaries.json`.
- [ ] **STR-3 (P2)** — Split `auth.routes.ts` (~1,200 lines) and `admin.routes.ts` (~1,130 lines)
      into per-resource modules mounted from an index; keep URL surface identical.
- [ ] **STR-4 (P2)** — Retire legacy `src/db/schema.ts` and orphaned `src/models/` in favor of
      `src/db/schema/*`.

### CI health

- [ ] **CI-3 follow-ups (P1/P2)** — Branch protection or merge queue so a red `main` can't
      accumulate (5 consecutive red runs 2026-07-08→09); plan the real Tailwind v4 migration and
      then drop the Dependabot `tailwindcss` major-bump ignore; deliberate k6 v2 migration, then
      drop the 1.x apt pin in `ci.yml`. (Fixed 2026-07-09: tailwind pinned to v3, stale `setToast`
      calls replaced, scheduler test env leak, homepage a11y gate, Dockerfile lockfile/postinstall,
      k6 pinned to 1.x.)
- [ ] **CI-3e (P1)** — 3 Playwright e2e regressions from FE-1 (first run of e2e since the redesign):
      `access-reviews.spec.ts:98` (Complete review button never enabled), `auth-flows.spec.ts:62`
      (email-verified heading), `invite.spec.ts:47` (invite accept content). Need local repro with
      real Postgres; see `codebase-audit-2026-07-09.md` § CI health.

### Testing / docs

## Backlog (unprioritized)

_(see audit doc for phase 5: `apps/*` workspace rename, `packages/shared-types`, `deploy/k8s/`)_
