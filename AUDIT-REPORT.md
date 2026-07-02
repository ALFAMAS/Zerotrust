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

| ID     | Status     | Summary                                                                                                 |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| **E2** | 🟠 Partial | `useApi`/`usePaginatedApi` on 7 pages; ~17 dashboard/admin pages still use legacy `useEffect`+`api.get` |
| **E4** | 🟡 Info    | 46 backend routes have no UI caller (many by design; some shipped features lack UI)                     |
| **E5** | 🟡 Info    | In-process `setInterval` schedulers — leader lock mitigates but not horizontally scalable               |
| **E6** | 🟡 Info    | Repository layer ~10% complete (4 repos); hot-path writes still mostly inline Drizzle                   |

---

## D. Security review (mandatory CWE table — all mitigated)

The repo's own `CLAUDE.md` documents the 2026-06-26 CWE sweep. Spot-checks confirm every class is genuinely mitigated, not aspirational:

| CWE                       | Status | Evidence                                                                                                                  |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| 601 Open redirect         | ✅     | `safeRelativeRedirect` used in client + server; OAuth uses exchange-code pattern                                          |
| 918 SSRF                  | ✅     | `assertSafeFetchUrl` / `fetchPublicUrl` enforced on webhook URL registration (`webhooks/routes.ts:47`)                    |
| 78 Command injection      | ✅     | `safeSpawnOptions({shell:false})` + `assertSafeCommand` allowlist in `dbBackup.service.ts`                                |
| 22 Path traversal         | ✅     | Upload extensions server-derived via `safeExtensionForContentType`                                                        |
| 532 Secrets in logs       | ✅     | Global error handler redacts `password=`/`Bearer` (verified by `apiHelpers.test.ts`)                                      |
| 1333 ReDoS                | ✅     | No `new RegExp(userInput)` found in static scan                                                                           |
| 327 Weak crypto           | ✅     | Only SHA-1 is in `passwordBreach.service.ts` (HIBP protocol, isolated `hibpSha1Hex` helper)                               |
| 1427 Identifier injection | ✅     | All DB queries go through Drizzle parameterized `sql` tag                                                                 |
| 79 XSS                    | ✅     | Global `inputSanitizationMiddleware` mounted; search highlight renderer uses React escaping, no `dangerouslySetInnerHTML` |

**One token-handling note:** access/refresh tokens are stored in `localStorage` (`packages/ui/src/lib/auth.ts`), not httpOnly cookies. This is a deliberate tradeoff for the SPA architecture (the API is on port 1337, UI on 3000 — different origins), but it means **the tokens are readable by any injected JS**. For a fork where stronger XSS-resistance is required, consider moving to httpOnly cookies + BFF pattern. Not a regression — just a design decision to revisit.

---

## E. Architecture / maintainability debt

### E2. 🟠 `useApi` hook exists but is barely used — **open**

`packages/ui/src/lib/hooks/useApi.ts` (with `usePaginatedApi`) is documented in `CLAUDE.md` as the replacement for `useEffect+api.get+loading` boilerplate. **7 of ~40 app pages use it** (`admin/page`, `admin/access-reviews`, `admin/alerts`, `admin/sessions`, `admin/users`, `dashboard/billing`, `dashboard/settings`). ~17 dashboard/admin pages still import `@/lib/api` and hand-roll fetch/loading/error (webhooks, wallet, admin audit/revenue/tenants/regions, etc.). Tracked in `todo.md` P2.

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

- **`todo.md`** — active backlog is **E2** (useApi migration).
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

## G. Recommended pre-fork checklist (priority order)

### Must fix (blocks the fork)

1. ✅ **A1** — UI production build passes.
2. ✅ **A2** — `.gitattributes` is present; no-floating-promise fixes applied;
   `bun run lint` exits 0.
3. ✅ **B1** — Reset-password page uses the OTP `/confirm` flow.
4. ✅ **B2** — Removed stale `/admin/users/invite` UI caller.
5. ✅ **B4** — Revoke-all sessions uses `DELETE /sessions`.
6. ✅ **B5** — Admin force logout uses `/force-logout`.
7. ✅ **B3 / B6** — Hook dependency hazards wrapped in `useCallback`.

### Should fix (correctness)

8. ✅ **B8** — Admin broadcast email fan-out routes through BullMQ.
9. ✅ **B7** — `inputSanitizationMiddleware` placement verified before routes.
10. ✅ **C2** — `@elastic/elasticsearch` is now an explicit dependency.
11. ✅ **C8** — Webhook store is DB-backed with migration `0027`.
12. ✅ **E1** — `apiClient.ts` is documented as canonical for new UI calls; `api.ts` is legacy compatibility.
13. ✅ **B9** — Admin sessions UI passes `page`/`limit` and exposes pagination controls.

### Nice to have (polish for a clean template)

14. ✅ **C1** — `/search/smart` is ranked full-text search; semantic/vector claims removed from generated docs.
15. ✅ **E3** — Finish shadcn migration (0 raw controls remaining).
16. **E2** — Migrate pages to `useApi`/`usePaginatedApi` (~17 pages remain; 7 done)
17. ✅ **C4 / C5 / C6 / C7** — OAuth linked accounts UI, per-category notification preferences, route scan confirmed, customer segment admin UI.
18. ✅ **C3** — README now says "software key store (hardware providers are stubs)" instead of advertising hardware-backed crypto.
19. ✅ Refresh `todo.md` to reflect this audit

---

## H. What's genuinely good (keep these)

- **Security posture is real**, not theater. Every CWE class has a canonical shared module that's actually wired in, with regression tests (`dbBackup.cwe78`, redaction, safe-redirect, safe-fetch). This is rare.
- **Test suite is broad and meaningful** — 838 tests including CWE regressions, OAuth account-linking safety, wallet double-spend, audit-chain integrity.
- **Generated SDK + OpenAPI + drift gate** (`verify:generated`) — the API surface stays in sync with docs and client by construction. Excellent template DX.
- **Centralized shared modules** (pagination, httpErrors, safeFetch, cryptoHash, apiClient, errorHandler) are documented in `CLAUDE.md` and actually enforced.
- **Observability is complete**: Prometheus `/metrics`, OTel traces, Sentry, SLO burn-rate alerting, per-component `/status`.
- **Modular monolith** with module-boundary CI enforcement (`boundaries:check`) — prevents the typical "everything imports everything" rot.
- **Provider-agnostic integrations**: S3 storage (AWS/B2/R2/MinIO/Wasabi), notification adapters (Slack/Teams/PagerDuty), multi-currency billing + Stripe Tax + EU VAT. Good defaults for a SaaS.

---

_Generated 2026-07-02. Re-run `bun run verify:generated` + `bun run --cwd packages/ui build` after applying fixes to confirm._
