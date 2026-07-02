# Codebase Audit Report — SaaS Starter Template Readiness

**Date:** 2026-07-02
**Scope:** Full repo (`src/` Hono API + `packages/ui/` Next.js 16 + `packages/client/` SDK + infra/docs)
**Audited by:** Hermes Agent (static scan + build/test/lint verification)
**Purpose:** Determine readiness to fork as a base for a new SaaS project.

---

## TL;DR

| Check                                          | Result                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `bun run test` (vitest)                        | ✅ **835 tests / 99 files passing**                                                                                    |
| `bun run build` (tsc API)                      | ✅ clean                                                                                                               |
| `bun run type-check`                           | ✅ clean                                                                                                               |
| `bun run verify:generated` (SDK + docs drift)  | ⚠ regenerates cleanly; expected tracked docs diffs are included for the improved API↔UI scanner                        |
| `bun run boundaries:check`                     | ✅ clean                                                                                                               |
| `bun run audit:integration` (API↔UI map)       | ✅ passes, now scans typed/template `api.*` calls and flags 87 backend routes with no UI caller (mostly by design)      |
| `bun run ui:audit` (shadcn adoption)           | ⚠ **44 raw HTML controls across 22 files** not migrated to shadcn                                                      |
| `bun run lint` (biome)                         | ✅ exits 0; only pre-existing script warnings remain                                                                    |
| `bun run --cwd packages/ui build` (next build) | ✅ production build passes; only existing Next/SWC version warning remains                                             |

**Verdict:** Strong, production-shaped SaaS template (27 route modules, 41 DB tables, 835 root tests, full Stripe/SSO/MFA/WebAuthn/observability). The original fork-blocking build/lint issues are fixed; remaining items are correctness/product-polish follow-ups tracked in `todo.md`.

---

## A. Build blockers (fix before forking)

### A1. ✅ UI production build passes — `next-themes` issue resolved

**File:** `packages/ui/src/app/layout.tsx:83`

```tsx
<ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
  {" "}
  // ← error ...
</ThemeProvider>
```

**Error (from `next build`):**

```
Property 'children' does not exist on type 'IntrinsicAttributes & ThemeProviderProps'.
```

**Root cause:** `next-themes` `^0.4.6` was installed. In v0.4 the `ThemeProvider` no longer takes `children`/`attribute` props the same way — it's now a wrapper that uses a `nonce`/context pattern and you wrap with `<NextThemesProvider>`, or pass props via a client wrapper. Either downgrade to `next-themes@0.3.x` or migrate the wrapper.
**Status:** Fixed and verified with `bun run --cwd packages/ui build`. The build now completes; the only remaining output is the existing `@next/swc` version warning.

### A2. ✅ `bun run lint` exits 0

Two classes:

1. **CRLF line endings** across ~30+ files (every diff shows `␍` removals). The repo was authored on Windows and `.gitattributes` isn't forcing LF. This is cosmetic but makes `bun run lint` / `lint:ci` permanently red and will trip up CI on the fork.
2. **Real `lint/nursery/noFloatingPromises` bugs** (4 sites) — these are genuine unhandled promise rejections, not formatting noise:
   - `packages/ui/src/app/admin/compliance/page.tsx:112` — `load()` in `useEffect`
   - `packages/ui/src/app/admin/jit/page.tsx:55` — `load()` in `useEffect`
   - `packages/ui/src/app/admin/jit/page.tsx:63` — `load()` after `await` (should be `await load()` or `void load()`)
   - `packages/ui/src/app/admin/settings/auth/page.tsx:128` — `load()` in `useEffect`

**Status:** Fixed and verified. LF normalization is enforced by `.gitattributes`; no-floating-promise hazards in the audited UI paths are fixed; `bun run lint` exits 0 with only pre-existing script warnings.

---

### B9. ✅ Admin sessions UI now passes `page`/`limit`

**Fix applied:** `packages/ui/src/app/admin/sessions/page.tsx` now requests `/admin/sessions?page=...&limit=20`, renders total/page counts, and exposes Previous/Next controls. `packages/ui/src/app/admin/sessions/page.test.tsx` covers the first-page request and next-page navigation.

---

## C. Incomplete / stubbed features (call out before forking)

### C1. ✅ Smart search is ranked full-text, not a semantic stub

**File:** `src/services/search.service.ts`

```ts
return smartSearchDatabase(query, orgId, region, limit);
```

**Fix applied:** the placeholder embedding branch was removed. `/search/smart` now
uses one bounded PostgreSQL `websearch_to_tsquery` ranked query across users,
organizations, and support tickets when Elasticsearch is unavailable; if
Elasticsearch is configured it uses the ES scorer. OpenAPI/generated docs now call
this **ranked smart search** rather than semantic/vector search, and
`search.service.test.ts` covers the old `EMBEDDING_PROVIDER=openai` downgrade path.

### C2. ✅ Elasticsearch dependency is explicit

**File:** `src/services/search.service.ts:45`

```ts
const { Client } = require("@elastic/elasticsearch");
```

**Fix applied:** `@elastic/elasticsearch` is now listed in root `dependencies` and locked in `bun.lock`, so enabling the Elasticsearch provider no longer depends on a hidden manual install.

### C3. ✅ Hardware key-store claims softened to match reality

**File:** `src/crypto/hardware-key-store.ts:197-378`

All three hardware providers throw `NotImplementedError` on every operation. The code explicitly fails fast at startup if `KEY_PROVIDER=tpm|secure-enclave|pkcs11` is set (good). Only the `software` provider works.

**Fix applied:** README directory-tree comment changed from "hardware key store" to "software key store (hardware providers are stubs)" so the README no longer overstates what ships. The hardware provider stubs remain in-tree as documented extension points with fail-fast guards.

### C4. ✅ OAuth "Account merge / linking" — UI now surfaces connect/disconnect

`POST /auth/me/link` and `DELETE /auth/oauth/:provider` are implemented and tested. The dashboard security page now renders a "Connect" button for unlinked providers (initiating the OAuth authorize flow) alongside the existing "Disconnect" button for linked providers.

### C5. ✅ Notification preferences UI exposes per-category controls

`/notifications/preferences` supports per-category × per-channel toggles (security, billing, account, social, system × email, push, inApp). The backend schema was extended and the dashboard notifications page now renders the full grid.

### C6. ✅ `/auth/me/nps` and `/auth/me/onboarding-complete` confirmed in route file

Both routes exist in `auth.routes.ts` (lines 1218 and 1283). The audit scanner missed them because it only catches `router.get/post(...)` with literal strings; these use inline handlers that the scanner pattern didn't match.

### C7. ✅ Customer segments — admin UI now exposes segment tagging

`PUT /admin/users/:id/segment` is called from the admin user detail page, which now renders a segment selector (champion, at_risk, expansion, new).

### C8. ✅ Webhook management is **in-memory**, not DB-backed — fixed

**Fix applied:** `src/webhooks/store.ts` is DB-backed via Drizzle and the new
`webhook_endpoints` table. Migration `drizzle/0027_webhook_endpoints.sql` and
`src/__tests__/webhookStore.persistence.test.ts` cover endpoint persistence.

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

### E1. ✅ UI HTTP client boundary is documented and extended

Two UI HTTP entry points still exist, but their roles are now explicit:

- `packages/ui/src/lib/apiClient.ts` — canonical boundary for new UI→API calls.
  It now exposes JSON helpers for GET/POST/PATCH/PUT/DELETE, FormData uploads,
  blob downloads, timeout, refresh replay, and transient 5xx/network retry.
- `packages/ui/src/lib/api.ts` — legacy compatibility facade used by older
  dashboard/admin pages while they are migrated in focused batches.

**Fix applied:** `CLAUDE.md` and new `docs/ui-http-client.md` document the split,
`apiClient.ts` gained `apiPatch()` / `apiPut()` and retry coverage, and
`useApi()` now consumes `apiClient.ts` internally. Remaining older page migration
is tracked under E2.

### E2. 🟠 `useApi` hook exists but is barely used

`packages/ui/src/lib/hooks/useApi.ts` (with `usePaginatedApi`) is documented in `CLAUDE.md` as the replacement for `useEffect+api.get+loading` boilerplate, yet **only ~2 pages use it** — almost every dashboard/admin page hand-rolls `useState(loading)` + `useEffect` + `api.get().then().catch().finally()`. Lots of duplicated boilerplate to clean up.

### E3. 🟡 44 raw HTML controls not migrated to shadcn/ui

Per `docs/shadcn-adoption-report.md`: 35 raw `<button>`, 8 `<input>`, 1 `<textarea>` across 22 files. Top offenders: `admin/users/[id]`, `dashboard/account`, `dashboard/organizations/[orgId]`, `NotificationBell`, `admin/settings/auth`, `CommandPalette`. The design system is only ~half-rolled-out.

### E4. 🟡 87 backend routes have no UI caller

Per `docs/api-ui-integration-matrix.md` after improving the scanner to catch typed and template-literal `api.*` calls. Most are legitimately admin/infra/SDK-only (exports, OAuth callbacks, webhooks, search index management, GDPR export). But a meaningful subset are **shipped features with no UI exposure**:

- `/admin/feedback`, `/admin/roles` (CRUD), `/admin/jit-grants/*`, `/billing/currencies`, `/billing/pricing`, `/billing/tax-exemptions/*`, `/billing/vat/validate`, `/orgs/:orgId/security/policy` (has UI), `/regions/*`, `/compliance/risk-assessment/*`, `/auth/oauth/:provider` (delete link)

These represent backend features that are **implemented but not surfaced** in the dashboard. For a template fork, decide which to expose and which to drop.

### E5. 🟡 Background scheduler is in-process (documented)

`docs/AUDIT.md` C3/P1 already flags this: `setInterval`-based schedulers in `src/jobs/scheduler.ts` run in every API replica unless `WORKER_MODE=true`. The leader-election lock mitigates duplication, but it's still a single-process pattern. Fine for a starter, but not horizontally scalable as-shipped.

### E6. 🟡 Repository layer is only ~10% complete

`docs/AUDIT.md` C1/M1 flags: only 4 transactional repositories exist (authSessions, stripeEvents, wallet, pointsLedger). Refresh-token rotation, session lifecycle, billing mutations, org role transitions still run as sequential non-transactional statements. The architecture is sound but the migration is incomplete.

---

## F. Documentation / DX notes

- **`todo.md`** refreshed — fixed/verified B1-B9, C2, C8, and E1 moved out of the active
  backlog; remaining audit follow-ups are tracked as P1/P2/P4 items.
- **`tdone.md`** refreshed — latest verification is **838 tests / 99 files** with
  build, lint, type-check, UI build, and boundary checks passing. Generated SDK/docs
  regenerate deterministically; the API↔UI and shadcn reports have expected tracked
  diffs from this audit batch.
- **`.bun-version`** pins Bun 1.2.23; the `compress()` guard in `server.ts` exists specifically because this version lacks `CompressionStream`. Consider bumping.
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
15. **E3** — Finish shadcn migration (44 raw controls)
16. **E2** — Migrate pages to `useApi`/`usePaginatedApi`
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
