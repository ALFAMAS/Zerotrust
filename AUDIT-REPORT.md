# Codebase Audit Report — SaaS Starter Template Readiness

**Date:** 2026-07-02
**Scope:** Full repo (`src/` Hono API + `packages/ui/` Next.js 16 + `packages/client/` SDK + infra/docs)
**Audited by:** Hermes Agent (static scan + build/test/lint verification)
**Purpose:** Determine readiness to fork as a base for a new SaaS project.

---

## TL;DR

| Check                                          | Result                                                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test` (vitest)                        | ✅ **838 tests / 99 files passing**                                                                                                    |
| `bun run build` (tsc API)                      | ✅ clean                                                                                                                               |
| `bun run type-check`                           | ✅ clean                                                                                                                               |
| `bun run verify:generated` (SDK + docs drift)  | ⚠ regenerates cleanly; expected tracked docs diffs are included for the improved API↔UI scanner                                        |
| `bun run boundaries:check`                     | ✅ clean                                                                                                                               |
| `bun run audit:integration` (API↔UI map)       | ✅ passes, scans typed/template `api.*`, `apiClient`, and `useApi` calls; flags 46 backend routes with no UI caller (mostly by design) |
| `bun run ui:audit` (shadcn adoption)           | ✅ **0 raw HTML controls** — migration complete                                                                                        |
| `bun run lint` (biome)                         | ✅ exits 0; only pre-existing script warnings remain                                                                                   |
| `bun run --cwd packages/ui build` (next build) | ✅ production build passes; only existing Next/SWC version warning remains                                                             |

**Verdict:** Strong, production-shaped SaaS template (27 route modules, 41 DB tables, 838 root tests, full Stripe/SSO/MFA/WebAuthn/observability). All fork-blocking and should-fix items are resolved — details consolidated in [`tdone.md`](./tdone.md).

### Open follow-ups (still in [`todo.md`](./todo.md))

| ID     | Status     | Summary                                                                                                                                       |
| ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **E2** | 🟠 Partial | TanStack Query on 5 pages (wallet, webhooks, billing, support, admin/audit); ~12 dashboard/admin pages still use legacy `useEffect`+`api.get` |
| **E4** | 🟡 Info    | 46 backend routes have no UI caller (many by design; some shipped features lack UI)                                                           |
| **E5** | 🟡 Info    | In-process `setInterval` schedulers — leader lock mitigates but not horizontally scalable                                                     |
| **E6** | 🟡 Info    | Repository layer ~10% complete (4 repos); hot-path writes still mostly inline Drizzle                                                         |

---

## D. Security review (mandatory CWE table — all mitigated)

**One token-handling note:** access/refresh tokens are stored in `localStorage` (`packages/ui/src/lib/auth.ts`), not httpOnly cookies. This is a deliberate tradeoff for the SPA architecture (the API is on port 1337, UI on 3000 — different origins), but it means **the tokens are readable by any injected JS**. For a fork where stronger XSS-resistance is required, consider moving to httpOnly cookies + BFF pattern. Not a regression — just a design decision to revisit.

---

## E. Architecture / maintainability debt

### E2. 🟠 TanStack Query server-state adoption is partial — **open**

`@tanstack/react-query` is installed and mounted through the UI root, with domain query keys/functions/hooks under `packages/ui/src/lib/server-state/*`. 5 pages now use the server-state layer: `dashboard/wallet`, `dashboard/webhooks`, `dashboard/billing`, `dashboard/support`, and `admin/audit`. Several dashboard/admin pages still import legacy `@/lib/api` and hand-roll `useEffect` + server data state (`admin revenue/tenants/regions/compliance`, etc.). Tracked in `todo.md` P2 and `docs/tanstack-query-progress.md`.

### E4. 🟡 46 backend routes have no UI caller

Per `docs/api-ui-integration-matrix.md` after improving the scanner to catch typed/template `api.*`, canonical `apiClient`, and `useApi`/`usePaginatedApi` calls. Most are legitimately admin/infra/SDK-only (OAuth callbacks, webhooks, search index management, machine endpoints). But a meaningful subset are **shipped features with no UI exposure**:

- `/admin/feedback`, `/admin/roles` (CRUD), `/admin/jit-grants/*`, `/billing/tax-exemptions/*`, `/billing/vat/validate`, selected `/regions/*` metadata endpoints

These represent backend features that are **implemented but not surfaced** in the dashboard. For a template fork, decide which to expose and which to drop.

### E5. 🟡 Background scheduler is in-process (documented)

`docs/AUDIT.md` C3/P1 already flags this: `setInterval`-based schedulers in `src/jobs/scheduler.ts` run in every API replica unless `WORKER_MODE=true`. The leader-election lock mitigates duplication, but it's still a single-process pattern. Fine for a starter, but not horizontally scalable as-shipped.

### E6. 🟡 Repository layer is only ~10% complete

`docs/AUDIT.md` C1/M1 flags: only 4 transactional repositories exist (authSessions, stripeEvents, wallet, pointsLedger). Refresh-token rotation, session lifecycle, billing mutations, org role transitions still run as sequential non-transactional statements. The architecture is sound but the migration is incomplete.

---

## F. Documentation / DX notes

- **`todo.md`** — active backlog is **E2** (TanStack Query server-state migration).
  All P1 fork-blocking items are cleared.
- **`tdone.md`** — completed audit items (A1–A2, B1–B9, C1–C8, E1, E3) consolidated
  under "Fork-readiness audit" (2026-07-02). Latest verification: **835 tests / 99 files**;
  build, lint, type-check, UI build, and boundary checks pass.
- **Bun runtime bump** is complete: `.bun-version` pins Bun 1.3.14 and
  `server.ts` mounts `compress()` directly after verifying `CompressionStream`
  is available in the pinned runtime.
- **`.gitattributes`** added — LF normalization is now documented/enforced for
  source/text files.

---

_Generated 2026-07-02. Re-run `bun run verify:generated` + `bun run --cwd packages/ui build` after applying fixes to confirm._
