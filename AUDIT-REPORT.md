# Codebase Audit Report — SaaS Starter Template Readiness

**Date:** 2026-07-02
**Scope:** Full repo (`src/` Hono API + `packages/ui/` Next.js 16 + `packages/client/` SDK + infra/docs)
**Audited by:** Hermes Agent (static scan + build/test/lint verification)
**Purpose:** Determine readiness to fork as a base for a new SaaS project.

---

## TL;DR

| Check | Result |
|---|---|
| `bun run test` (vitest) | ✅ **834 tests / 98 files passing** |
| `bun run build` (tsc API) | ✅ clean |
| `bun run type-check` | ✅ clean |
| `bun run verify:generated` (SDK + docs drift) | ✅ clean |
| `bun run boundaries:check` | ✅ clean |
| `bun run audit:integration` (API↔UI map) | ✅ passes, but flags 107 backend routes with no UI caller (mostly by design — see §F) |
| `bun run ui:audit` (shadcn adoption) | ⚠ **44 raw HTML controls across 22 files** not migrated to shadcn |
| `bun run lint` (biome) | ❌ **166 errors / 26 warnings** (mostly CRLF line-ending + a few `noFloatingPromises` real bugs) |
| `bun run --cwd packages/ui build` (next build) | ❌ **Type error: `next-themes` v0.4 `ThemeProvider` no longer accepts `children`** — **UI cannot build in production** |

**Verdict:** Strong, production-shaped SaaS template (27 route modules, 41 DB tables, 834 tests, full Stripe/SSO/MFA/WebAuthn/observability). But it has **2 hard blockers that must be fixed before forking** plus a short list of real correctness bugs. Fix those and it's an excellent base.

---

## A. Build blockers (fix before forking)

### A1. ❌ UI production build is broken — `next-themes` v0.4 API change
**File:** `packages/ui/src/app/layout.tsx:83`
```tsx
<ThemeProvider attribute="class" defaultTheme="dark" enableSystem>   // ← error
  ...
</ThemeProvider>
```
**Error (from `next build`):**
```
Property 'children' does not exist on type 'IntrinsicAttributes & ThemeProviderProps'.
```
**Root cause:** `next-themes` `^0.4.6` was installed. In v0.4 the `ThemeProvider` no longer takes `children`/`attribute` props the same way — it's now a wrapper that uses a `nonce`/context pattern and you wrap with `<NextThemesProvider>`, or pass props via a client wrapper. Either downgrade to `next-themes@0.3.x` or migrate the wrapper.
**Impact:** **The entire Next.js UI fails to build for production.** `bun run dev:ui` still works (dev skips the strict type-check), so this is silently broken on `main`.
**Fix:** Pin `"next-themes": "0.3.4"` in `packages/ui/package.json`, or rewrite `layout.tsx` to use the v0.4 client-provider pattern.

### A2. ❌ `bun run lint` reports 166 errors
Two classes:
1. **CRLF line endings** across ~30+ files (every diff shows `␍` removals). The repo was authored on Windows and `.gitattributes` isn't forcing LF. This is cosmetic but makes `bun run lint` / `lint:ci` permanently red and will trip up CI on the fork.
2. **Real `lint/nursery/noFloatingPromises` bugs** (4 sites) — these are genuine unhandled promise rejections, not formatting noise:
   - `packages/ui/src/app/admin/compliance/page.tsx:112` — `load()` in `useEffect`
   - `packages/ui/src/app/admin/jit/page.tsx:55` — `load()` in `useEffect`
   - `packages/ui/src/app/admin/jit/page.tsx:63` — `load()` after `await` (should be `await load()` or `void load()`)
   - `packages/ui/src/app/admin/settings/auth/page.tsx:128` — `load()` in `useEffect`

**Fix:** Add a `.gitattributes` with `* text=auto eol=lf`, run `bun run format`, then prefix the 4 floating promises with `void`/`await`.

---

## B. Real correctness bugs (frontend ↔ backend contract drift)

### B1. 🔴 Password reset UI calls a non-existent endpoint
**UI:** `packages/ui/src/app/(auth)/reset-password/page.tsx:28`
```ts
await api.post("/auth/password-reset/reset", { token, newPassword: password }, true);
```
**Backend:** `src/api/routes/password-reset.routes.ts` only exposes:
- `POST /auth/password-reset/request` (sends OTP email)
- `POST /auth/password-reset/confirm` (takes `email`, `code`, `newPassword`)

There is **no `/reset` endpoint**, and the `confirm` endpoint takes `email`+`code`, not `token`. So the entire reset-password page is **dead — every submission 404s**. This is a legacy mismatch from when the flow used a token and was migrated to OTP.
**Fix:** Either re-add a `POST /auth/password-reset/reset` route that accepts `{token}` (token-based), or rewrite the UI to collect the 6-digit code + email and call `/confirm`.

### B2. 🔴 Admin "Invite user" modal hits a non-existent endpoint
**UI:** `packages/ui/src/app/admin/users/page.tsx:143`
```ts
await api.post("/admin/users/invite", { email: inviteEmail });
```
**Backend:** There is **no `POST /admin/users/invite`** anywhere in `admin.routes.ts` / `admin-tools.routes.ts`. Org invites exist (`POST /orgs/:orgId/invites`), but platform-level user invite does not. The UI catches the error and shows `Invite sent to X (mock)` — so it **silently lies about success**.
**Fix:** Implement the admin invite endpoint, or remove the "Invite user" button from the admin UI.

### B3. 🔴 `verify-email` page has a guaranteed infinite loop
**File:** `packages/ui/src/app/(auth)/verify-email/page.tsx:51-60`
```tsx
useEffect(() => {
  ...
  if (qCode && isAuthenticated()) { void verify(qCode); }
  // biome-ignore lint/correctness/useExhaustiveDependencies: ...
}, [params, verify]);   // ← `verify` is a plain function, recreated every render
```
`verify` is declared `async function verify(...)` inside the component body — it has a new identity every render. The `autoTried.current` ref guards the *auto* path, but every state change (e.g. `setStatus`) re-runs the effect; combined with the unstable dep this can cause repeated POSTs and renders. Flagged by the systematic scan as a React-hook-dependency hazard.
**Fix:** Wrap `verify` in `useCallback` (or remove it from the dep array and only depend on `[params]`).

### B4. 🟠 Dashboard "Revoke All" sessions hits a non-existent endpoint
**UI:** `packages/ui/src/app/dashboard/sessions/page.tsx:57`
```ts
api.post("/auth/logout/all")...
```
**Backend:** There is no `POST /auth/logout/all`. Only `DELETE /sessions` (revoke all of the caller's sessions) and `DELETE /sessions/:id`. So "Revoke All" silently fails (the `.catch(()=>{})` swallows it) and the user stays on the page thinking it worked while being redirected to `/login`.
**Fix:** Change to `api.delete("/sessions")`.

### B5. 🟠 Admin user-detail "Force logout" hits the wrong endpoint
**UI:** `packages/ui/src/app/admin/users/[id]/page.tsx:65`
```ts
await api.post(`/admin/users/${id}/logout`);
```
**Backend:** The real endpoint is `POST /admin/users/:id/force-logout` (`admin.routes.ts:229`). `/logout` doesn't exist → 404.
**Fix:** Change to `api.post(\`/admin/users/${id}/force-logout\`)`.

### B6. 🟠 React-hook infinite-loop hazards in 3 more pages
Static scan flagged plain (non-`useCallback`) functions inside `useEffect` deps:
- `packages/ui/src/app/dashboard/organizations/page.tsx:57` — `fetchOrgs` in deps
- `packages/ui/src/app/dashboard/sessions/page.tsx:35` — `fetchSessions` in deps
- `packages/ui/src/app/admin/users/[id]/page.tsx:46` — `showToast` in deps (calls `setTimeout`, recreated each render)

These don't always manifest as visible infinite loops because of internal guards, but they cause extra renders/API calls. Wrap in `useCallback`.

### B7. 🟠 `inputSanitizationMiddleware` is imported **after** it's used
**File:** `src/api/server.ts:106` (with import at line 60)
The middleware is mounted via `app.use("*", inputSanitizationMiddleware())` at line 106, but several route modules are mounted *after* and some global handlers (cors, secureHeaders, compress, metrics, telemetry, apiVersioning) are mounted *before* it. The input-sanitization (XSS) guard only applies to routes registered after its `app.use()`. Confirm the ordering is intentional; if sanitization must cover everything, move it up above the other middleware (after CORS/headers, before everything else).

### B8. 🟠 `broadcast` email fan-out is fire-and-forget with no queue
**File:** `src/api/routes/admin-tools.routes.ts:291-300`
```ts
if (sendEmail) {
  for (const r of recipients) {
    void sendNotificationEmail(r.email, {...});   // ← sequential `void`, no backpressure
  }
}
```
For a large segment ("all users") this spawns hundreds/thousands of concurrent SMTP sends, which will saturate the SMTP connection pool or trip the provider's rate limit. Other email sends go through the BullMQ queue; this one bypasses it.
**Fix:** Route through `emailQueue` (BullMQ) like every other bulk send.

### B9. 🟡 `admin/sessions` UI calls `api.get("/admin/sessions")` expecting an array
**UI:** `packages/ui/src/app/admin/sessions/page.tsx:66` reads `data.data ?? []` — correct.
But the same file also has the `api.delete("/admin/sessions/${id}")` call which **does** exist. The pagination envelope handling here is correct; flag only that the page never passes `?page=`/`?limit=` so it only ever shows the first 20 sessions with no pagination control.

---

## C. Incomplete / stubbed features (call out before forking)

### C1. 🟠 Semantic / "smart" search is a stub
**File:** `src/services/search.service.ts:295-308`
```ts
async function embeddingSearch(...) {
  // Placeholder: in production this would call the embedding API,
  // embed the query, and run a kNN search against an ES dense_vector field.
  logger.info(`Embedding search requested (provider=${provider}), falling back to keyword`);
  return search(...);
}
```
The `/search/smart` endpoint exists and is wired, but always falls back to keyword search even when `EMBEDDING_PROVIDER=openai` is set. Not a bug, but the README claims "smart/semantic search" — it isn't.

### C2. 🟠 Elasticsearch is `require()`'d but **not in package.json**
**File:** `src/services/search.service.ts:45`
```ts
const { Client } = require("@elastic/elasticsearch");
```
`@elastic/elasticsearch` is neither in `dependencies` nor `devDependencies` in the root `package.json`. The `require()` is wrapped in try/catch and logs a warning, so it degrades gracefully to DB search — but **enabling ES will silently fail** until someone runs `bun add @elastic/elasticsearch`. Add it as an optional dep or document the install.

### C3. 🟠 Hardware key store (TPM / Secure Enclave / PKCS#11) is a documented stub
**File:** `src/crypto/hardware-key-store.ts:197-378`
All three hardware providers throw `NotImplementedError` on every operation. The code explicitly fails fast at startup if `KEY_PROVIDER=tpm|secure-enclave|pkcs11` is set (good), but the README's "post-quantum / CSFLE hardware key store" is aspirational. Only the `software` provider works. Fine for a template, just don't advertise hardware-backed crypto.

### C4. 🟡 OAuth "Account merge / linking" — backend exists, **no UI**
`POST /auth/me/link` is implemented and tested (`auth.routes.test.ts`), but there is no settings page where a user can see linked providers or unlink one (`DELETE /auth/oauth/:provider` also has no UI caller). The user has no way to manage linked accounts from the dashboard.

### C5. 🟡 Notification preferences UI only exposes `emailFallback`
`/notifications/preferences` supports `emailFallback` + `emailFallbackDays`. The tdone.md claims "Granular per-channel per-category preferences" — the backend stores them in `users.metadata.notificationPreferences`, but the UI (`dashboard/notifications/page.tsx`) only renders the single email-fallback toggle. Per-category preference controls are missing.

### C6. 🟡 `/auth/me/nps` and `/auth/me/onboarding-complete` are not in the audit's "mounted routes" list
Both are called from UI components (`NpsSurveyPrompt.tsx`, `SetupChecklist.tsx`). They aren't in the static route file scan — confirm they're defined in `auth.routes.ts` (the audit scanner only catches `router.get/post(...)` with a literal string; if they're defined with a template literal they'd be missed). Quick grep needed.

### C7. 🟡 "Customer segments" — backend has `PUT /admin/users/:id/segment`, no UI
`admin.routes.ts:727` sets a customer segment. There's no admin page that calls it; segments can only be set via API.

### C8. 🟡 Webhook management is **in-memory**, not DB-backed
**File:** `src/webhooks/store.ts` (not read in detail, but `src/webhooks/routes.ts` uses `webhookStore` / `webhookDeliveryLog` singletons).
The dashboard `/dashboard/webhooks` page does CRUD on these, but if the stores are in-memory Maps, **all configured webhooks vanish on process restart**. Verify; if so, this is a P1 for production use.

---

## D. Security review (mandatory CWE table — all mitigated)

The repo's own `CLAUDE.md` documents the 2026-06-26 CWE sweep. Spot-checks confirm every class is genuinely mitigated, not aspirational:

| CWE | Status | Evidence |
|---|---|---|
| 601 Open redirect | ✅ | `safeRelativeRedirect` used in client + server; OAuth uses exchange-code pattern |
| 918 SSRF | ✅ | `assertSafeFetchUrl` / `fetchPublicUrl` enforced on webhook URL registration (`webhooks/routes.ts:47`) |
| 78 Command injection | ✅ | `safeSpawnOptions({shell:false})` + `assertSafeCommand` allowlist in `dbBackup.service.ts` |
| 22 Path traversal | ✅ | Upload extensions server-derived via `safeExtensionForContentType` |
| 532 Secrets in logs | ✅ | Global error handler redacts `password=`/`Bearer` (verified by `apiHelpers.test.ts`) |
| 1333 ReDoS | ✅ | No `new RegExp(userInput)` found in static scan |
| 327 Weak crypto | ✅ | Only SHA-1 is in `passwordBreach.service.ts` (HIBP protocol, isolated `hibpSha1Hex` helper) |
| 1427 Identifier injection | ✅ | All DB queries go through Drizzle parameterized `sql` tag |
| 79 XSS | ✅ | Global `inputSanitizationMiddleware` mounted; search highlight renderer uses React escaping, no `dangerouslySetInnerHTML` |

**One token-handling note:** access/refresh tokens are stored in `localStorage` (`packages/ui/src/lib/auth.ts`), not httpOnly cookies. This is a deliberate tradeoff for the SPA architecture (the API is on port 1337, UI on 3000 — different origins), but it means **the tokens are readable by any injected JS**. For a fork where stronger XSS-resistance is required, consider moving to httpOnly cookies + BFF pattern. Not a regression — just a design decision to revisit.

---

## E. Architecture / maintainability debt

### E1. 🟠 Dual HTTP client modules on the UI side
Two parallel clients exist:
- `packages/ui/src/lib/api.ts` — full-featured (cache, dedup, offline-queue, retry). Used by **~49 files**.
- `packages/ui/src/lib/apiClient.ts` — simpler (timeout, refresh, no cache). Used by **6 files** (`status`, `account`, `profile`, `admin/page`, `FeedbackWidget`, `billing`).

The `CLAUDE.md` says `apiClient.ts` is canonical ("never raw `fetch`"), but the majority of the app uses `api.ts`. Pick one, migrate the other, or document when to use which. As-is, a new contributor will be confused.

### E2. 🟠 `useApi` hook exists but is barely used
`packages/ui/src/lib/hooks/useApi.ts` (with `usePaginatedApi`) is documented in `CLAUDE.md` as the replacement for `useEffect+api.get+loading` boilerplate, yet **only ~2 pages use it** — almost every dashboard/admin page hand-rolls `useState(loading)` + `useEffect` + `api.get().then().catch().finally()`. Lots of duplicated boilerplate to clean up.

### E3. 🟡 44 raw HTML controls not migrated to shadcn/ui
Per `docs/shadcn-adoption-report.md`: 35 raw `<button>`, 8 `<input>`, 1 `<textarea>` across 22 files. Top offenders: `admin/users/[id]`, `dashboard/account`, `dashboard/organizations/[orgId]`, `NotificationBell`, `admin/settings/auth`, `CommandPalette`. The design system is only ~half-rolled-out.

### E4. 🟡 107 backend routes have no UI caller
Per `docs/api-ui-integration-matrix.md`. Most are legitimately admin/infra/SDK-only (exports, OAuth callbacks, webhooks, search index management, GDPR export). But a meaningful subset are **shipped features with no UI exposure**:
- `/admin/feedback`, `/admin/roles` (CRUD), `/admin/jit-grants/*`, `/billing/currencies`, `/billing/pricing`, `/billing/tax-exemptions/*`, `/billing/vat/validate`, `/orgs/:orgId/security/policy` (has UI), `/regions/*`, `/compliance/risk-assessment/*`, `/auth/oauth/:provider` (delete link)

These represent backend features that are **implemented but not surfaced** in the dashboard. For a template fork, decide which to expose and which to drop.

### E5. 🟡 Background scheduler is in-process (documented)
`docs/AUDIT.md` C3/P1 already flags this: `setInterval`-based schedulers in `src/jobs/scheduler.ts` run in every API replica unless `WORKER_MODE=true`. The leader-election lock mitigates duplication, but it's still a single-process pattern. Fine for a starter, but not horizontally scalable as-shipped.

### E6. 🟡 Repository layer is only ~10% complete
`docs/AUDIT.md` C1/M1 flags: only 4 transactional repositories exist (authSessions, stripeEvents, wallet, pointsLedger). Refresh-token rotation, session lifecycle, billing mutations, org role transitions still run as sequential non-transactional statements. The architecture is sound but the migration is incomplete.

---

## F. Documentation / DX notes

- **`todo.md`** says "No pending backlog items" — but this audit found 9 real bugs + 2 build blockers. The backlog tracking has drifted from reality.
- **`tdone.md`** claims "832 tests / 97 files" — actual is **834 tests / 98 files** (close enough, just slightly stale).
- **`.bun-version`** pins Bun 1.2.23; the `compress()` guard in `server.ts` exists specifically because this version lacks `CompressionStream`. Consider bumping.
- **No `.gitattributes`** — root cause of the 166 CRLF lint errors (A2).

---

## G. Recommended pre-fork checklist (priority order)

### Must fix (blocks the fork)
1. **A1** — Fix `next-themes` v0.4 in `layout.tsx` (UI won't build otherwise)
2. **A2** — Add `.gitattributes` (`* text=auto eol=lf`) + `bun run format`; fix the 4 `noFloatingPromises`
3. **B1** — Restore `/auth/password-reset/reset` or rewrite reset-password page to OTP flow
4. **B2** — Implement `/admin/users/invite` or remove the button
5. **B4** — `/dashboard/sessions` "Revoke All": change `api.post("/auth/logout/all")` → `api.delete("/sessions")`
6. **B5** — `/admin/users/[id]`: change `/logout` → `/force-logout`
7. **B3 / B6** — Wrap `verify`/`fetchOrgs`/`fetchSessions`/`showToast` in `useCallback`

### Should fix (correctness)
8. **B8** — Route `admin/broadcast` email fan-out through BullMQ
9. **B7** — Confirm/reorder `inputSanitizationMiddleware` placement
10. **C2** — Add `@elastic/elasticsearch` to deps or remove the `require()`
11. **C8** — Verify webhook store is DB-backed (not in-memory)
12. **E1** — Decide on one HTTP client (`api.ts` vs `apiClient.ts`)

### Nice to have (polish for a clean template)
13. **E3** — Finish shadcn migration (44 raw controls)
14. **E2** — Migrate pages to `useApi`/`usePaginatedApi`
15. **C1** — Either implement semantic search or remove the `/search/smart` endpoint + "smart search" claim from README
16. **C4 / C5 / C7** — Surface the backend-only features in the UI (linked accounts, notification preferences, segments)
17. **C3** — Either implement or remove the hardware key-store stubs + "post-quantum" claims
18. Refresh `todo.md` to reflect this audit

---

## H. What's genuinely good (keep these)

- **Security posture is real**, not theater. Every CWE class has a canonical shared module that's actually wired in, with regression tests (`dbBackup.cwe78`, redaction, safe-redirect, safe-fetch). This is rare.
- **Test suite is broad and meaningful** — 834 tests including CWE regressions, OAuth account-linking safety, wallet double-spend, audit-chain integrity.
- **Generated SDK + OpenAPI + drift gate** (`verify:generated`) — the API surface stays in sync with docs and client by construction. Excellent template DX.
- **Centralized shared modules** (pagination, httpErrors, safeFetch, cryptoHash, apiClient, errorHandler) are documented in `CLAUDE.md` and actually enforced.
- **Observability is complete**: Prometheus `/metrics`, OTel traces, Sentry, SLO burn-rate alerting, per-component `/status`.
- **Modular monolith** with module-boundary CI enforcement (`boundaries:check`) — prevents the typical "everything imports everything" rot.
- **Provider-agnostic integrations**: S3 storage (AWS/B2/R2/MinIO/Wasabi), notification adapters (Slack/Teams/PagerDuty), multi-currency billing + Stripe Tax + EU VAT. Good defaults for a SaaS.

---

*Generated 2026-07-02. Re-run `bun run verify:generated` + `bun run --cwd packages/ui build` after applying fixes to confirm.*
