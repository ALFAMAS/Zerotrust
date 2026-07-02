# Codebase Audit Report — SaaS Starter Template Readiness

**Date:** 2026-07-03
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
| `bun run audit:integration` (API↔UI map)       | ✅ passes, scans typed/template `api.*`, `apiClient`, and `useApi` calls; documents 25 API/SDK-only product-surface decisions outside the actionable unmatched list |
| `bun run ui:audit` (shadcn adoption)           | ✅ **0 raw HTML controls** — migration complete                                                                                        |
| `bun run lint` (biome)                         | ✅ exits 0; only pre-existing script warnings remain                                                                                   |
| `bun run --cwd packages/ui build` (next build) | ✅ production build passes; only existing Next/SWC version warning remains                                                             |

**Verdict:** Strong, production-shaped SaaS template (27 route modules, 41 DB tables, 838 root tests, full Stripe/SSO/MFA/WebAuthn/observability). All fork-blocking, should-fix, and P2 maintainability items are resolved — details consolidated in [`tdone.md`](./tdone.md).

### Open follow-ups (still in [`todo.md`](./todo.md))

| ID     | Status     | Summary                                                                                                                                       |
| ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **E5** | 🟡 Info    | In-process `setInterval` schedulers — leader lock mitigates but not horizontally scalable                                                     |
| **E6** | 🟡 Info    | Repository layer ~10% complete (4 repos); hot-path writes still mostly inline Drizzle                                                         |

---

## D. Security review (mandatory CWE table — all mitigated)

**One token-handling note:** access/refresh tokens are stored in `localStorage` (`packages/ui/src/lib/auth.ts`), not httpOnly cookies. This is a deliberate tradeoff for the SPA architecture (the API is on port 1337, UI on 3000 — different origins), but it means **the tokens are readable by any injected JS**. For a fork where stronger XSS-resistance is required, consider moving to httpOnly cookies + BFF pattern. Not a regression — just a design decision to revisit.

---

## E. Architecture / maintainability debt

### E2. ✅ TanStack Query server-state adoption — **resolved**

`@tanstack/react-query` is installed and mounted through the UI root, with domain query keys/functions/hooks under `packages/ui/src/lib/server-state/*`. All 42 data-fetching pages are migrated, the old `packages/ui/src/lib/api.ts` facade is removed, and grep confirms no `@/lib/api` imports under `packages/ui/src`.

### E4. ✅ Product-surface gaps — **resolved for P2**

`docs/api-ui-integration-matrix.md` now documents 25 deliberate API/SDK-only product-surface decisions (admin feedback/roles/JIT grants, billing ops endpoints, admin attachments/lifecycle-email tooling, search index management, regional metadata, email unsubscribe, and wallet spend) and excludes them from the actionable unmatched backend-route list.

### E5. 🟡 Background scheduler is in-process (documented)

`docs/AUDIT.md` C3/P1 already flags this: `setInterval`-based schedulers in `src/jobs/scheduler.ts` run in every API replica unless `WORKER_MODE=true`. The leader-election lock mitigates duplication, but it's still a single-process pattern. Fine for a starter, but not horizontally scalable as-shipped.

### E6. 🟡 Repository layer is only ~10% complete

`docs/AUDIT.md` C1/M1 flags: only 4 transactional repositories exist (authSessions, stripeEvents, wallet, pointsLedger). Refresh-token rotation, session lifecycle, billing mutations, org role transitions still run as sequential non-transactional statements. The architecture is sound but the migration is incomplete.

---

## F. Documentation / DX notes

- **`todo.md`** — P2 maintainability/refactor backlog is cleared; active backlog now starts at P3/P4 follow-ups.
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

_Generated 2026-07-03. Re-run `bun run verify:generated` + `bun run --cwd packages/ui build` after applying fixes to confirm._
