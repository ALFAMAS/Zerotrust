# TanStack Query frontend migration progress

Tracks the frontend server-state migration from ad-hoc `useEffect` + local loading/error state to TanStack Query.

## Goals

- Use the official React adapter: `@tanstack/react-query`.
- Keep fetched API resources in TanStack Query, not global client state.
- Model keys by product domain, not raw URL strings alone.
- Colocate query functions, query options, hooks, and mutations in `packages/ui/src/lib/server-state/<domain>.ts`.
- Use canonical `apiClient` helpers (`apiGet`, `apiPost`, `apiPatch`, `apiDelete`) inside server-state modules.
- Render intentional loading, error + retry, empty, stale cached data, background-refetch, and mutation-pending states.
- Use optimistic updates only where rollback is simple and useful.

## Status legend

- `[x]` Done and verified locally.
- `[~]` Partial / started.
- `[ ]` Not migrated yet.

## Summary (audited 2026-07-03)

| Metric | Count |
| --- | --- |
| App `page.tsx` files | 47 |
| Migrated to TanStack Query | 28 |
| Remaining (`lib/api` relative imports) | 11 |
| Remaining (other legacy: `useApi`, raw `fetch`, `useEffect`+`apiGet`) | 3 |
| Static / no server state | 5 |
| **Data-fetching completion** | **~67%** (28/42) |

`@/lib/api` alias imports: **0** under `packages/ui/src`.

## Foundation

- [x] Install `@tanstack/react-query` in `packages/ui`.
- [x] Mount one app-level `QueryProvider` around existing frontend providers.
- [x] Add product-domain query key registry in `packages/ui/src/lib/server-state/queryKeys.ts`.
- [x] Add shared server-state freshness UI (`ServerStateStatus`).
- [x] Add domain type helpers in `packages/ui/src/lib/server-state/types.ts`.

## Migrated surfaces

| Area | Status | Notes | Verification |
| --- | --- | --- | --- |
| `/dashboard/wallet` | [x] | Wallet detail + transactions moved to TanStack Query. Top-up uses optimistic balance/transaction update, rollback, and targeted invalidation. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/wallet.test.tsx` |
| `/dashboard/webhooks` | [x] | Endpoint list + delivery logs moved to TanStack Query. Toggle/delete use optimistic list updates with rollback; create, ping, toggle, and delete target webhook list/detail/delivery invalidation. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/webhooks.test.tsx` |
| `/dashboard/billing` | [x] | Subscription, currencies, and localized pricing moved to TanStack Query. Cancel/reactivate mutations invalidate subscription state; checkout/portal mutations keep safe external redirects at the page boundary. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/billing.test.tsx` |
| `/dashboard/support` | [x] | Ticket list + thread detail moved to TanStack Query. Create/reply/close mutations optimistically update list and thread caches with targeted invalidation. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/support.test.tsx` |
| `/admin/audit` | [x] | Audit log entries and hash-chain integrity verify moved to TanStack Query. Verify is a manual refetch (enabled:false), entries auto-fetch with loading/error states. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/audit.test.tsx` |
| `/admin/tenants` | [x] | Tenant list moved to TanStack Query. Create/plan/status/delete use mutations with optimistic list updates, rollback, and targeted invalidation. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/tenants.test.tsx` |
| `/admin/jit` | [x] | Incoming cross-tenant JIT request list moved to TanStack Query. Approve/deny mutations invalidate the incoming list. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/jit.test.tsx` |
| `/admin/compliance` | [x] | SOC2 readiness/controls and annual risk assessment moved to TanStack Query. Control status cycling uses optimistic mutation with readiness invalidation. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/compliance.test.tsx` |
| `/admin/anomaly` | [x] | Behavior baselines list and reset/score actions moved to TanStack Query. Reset uses optimistic list removal with rollback and targeted invalidation. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/anomaly.test.tsx` |
| `/admin/settings/general` | [x] | General app settings load/save moved to TanStack Query. Save mutation updates settings cache and invalidates the settings domain. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/settings.test.tsx` |
| `/admin/users/[id]` | [x] | Admin user detail moved to TanStack Query. Status/segment mutations use optimistic detail cache updates with rollback; force-logout and delete invalidate targeted keys. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/adminUsers.test.tsx` |
| `NotificationBell` (shared) | [x] | Unread count + preview list moved to TanStack Query. Mark-read/mark-all-read use optimistic cache updates with rollback; SSE bumps unread-count cache. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/notifications.test.tsx` |
| `LiveChatWidget` (shared) | [x] | Third-party identity preload uses `useAuthMeQuery`; native fallback uses support ticket mutations. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/auth.test.tsx` |
| `VerifyEmailBanner` (shared) | [x] | Current-user check + resend verification moved to `auth.ts` TanStack Query hooks. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/auth.test.tsx` |
| `SetupChecklist` (shared) | [x] | Onboarding-complete mutation moved to `auth.ts`; user prop unchanged (parent still supplies `/auth/me`). | `NODE_ENV=test bun run --cwd packages/ui test -- src/components/SetupChecklist.test.tsx` |
| `LocaleSwitcher` (shared) | [x] | Locale persistence uses `usePatchAuthMeMutation` from `auth.ts`; cookie + reload unchanged. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/auth.test.tsx` |
| `NpsSurveyPrompt` (shared) | [x] | Should-prompt query + submit mutation moved to `nps.ts` TanStack Query hooks. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/nps.test.tsx` |
| `/admin/sessions` | [x] | Paginated session list + revoke mutation moved to `sessions.ts`. Optimistic revoke with rollback and list invalidation. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/sessions.test.tsx` |
| `/admin/alerts` | [x] | Alert channel list + create/toggle/test/delete moved to `alertChannels.ts`. Toggle/delete use optimistic cache updates with rollback. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/alertChannels.test.tsx` |
| `/dashboard/settings` | [x] | OAuth provider list + disconnect moved to `auth.ts` (`useOAuthProvidersQuery`, `useDisconnectOAuthProviderMutation`). | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/auth.test.tsx` |
| `/dashboard/account` | [x] | GDPR export/delete/cancel moved to `account.ts` mutation hooks (`apiGetBlob` + `apiDelete` + `apiPost`). | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/account.test.tsx` |
| `admin/layout.tsx` (admin shell) | [x] | Admin role gate uses `useAuthMeQuery` from `auth.ts`; no child admin API calls until authorized. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/auth.test.tsx` |
| `/admin/access-reviews` | [x] | List + detail + start/decide/complete moved to `accessReviews.ts`. Optimistic item decision with rollback. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/accessReviews.test.tsx` |
| `/admin/revenue` | [x] | Revenue summary + broadcast mutation moved to `revenue.ts`. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/revenue.test.tsx` |
| `/admin/regions` | [x] | Region health query + org region pin mutation moved to `regions.ts`. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/regions.test.tsx` |
| `/dashboard/search` | [x] | Debounced full-text search moved to `search.ts` (`enabled` when query ≥ 2 chars). | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/search.test.tsx` |
| `/dashboard` (home) | [x] | User profile + active sessions via `auth.ts` + `sessions.ts` (`useAuthMeQuery`, `useUserSessionsListQuery`). | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/auth.test.tsx` |
| `/dashboard/profile` | [x] | Profile load/save, avatar upload, TOTP disable via extended `auth.ts`. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/auth.test.tsx` |
| `/dashboard/organizations` | [x] | Org list + create moved to `organizations.ts`. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/organizations.test.tsx` |
| `/dashboard/security` | [x] | TOTP, passkeys, OAuth connect/disconnect via extended `auth.ts`. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/auth.test.tsx` |
| `/dashboard/api-keys` | [x] | API key list/create/revoke moved to `apiKeys.ts`. Optimistic revoke with rollback. | `NODE_ENV=test bun run --cwd packages/ui test -- src/lib/server-state/apiKeys.test.tsx` |

## Phase 4 — relative `lib/api` imports (`packages/ui/src/app`)

Tracks migration of app routes still importing legacy `api` via relative paths (`../../lib/api`), after the `@/lib/api` alias backlog was cleared.

### Migrated this batch (2026-07-03)

| Page | Server-state module(s) |
| --- | --- |
| `/dashboard` (home) | `auth.ts`, `sessions.ts` (user sessions) |
| `/dashboard/profile` | `auth.ts` |
| `/dashboard/organizations` | `organizations.ts` |
| `/dashboard/security` | `auth.ts` |
| `/dashboard/api-keys` | `apiKeys.ts` |

New modules: `organizations.ts`, `apiKeys.ts`. Extended: `auth.ts` (avatar, TOTP, passkey, OAuth authorize), `sessions.ts` (user `/sessions` list/revoke).

### Remaining relative `lib/api` imports (11 files)

| Area | File | Notes |
| --- | --- | --- |
| Auth | `(auth)/login/page.tsx` | mutations |
| Auth | `(auth)/register/page.tsx` | mutations |
| Auth | `(auth)/forgot-password/page.tsx` | mutations |
| Auth | `(auth)/reset-password/page.tsx` | mutations |
| Auth | `(auth)/verify-email/page.tsx` | mutations |
| Auth | `(auth)/magic-link/page.tsx` | mutations |
| Auth | `(auth)/magic-link/verify/page.tsx` | mutations |
| Dashboard | `dashboard/sessions/page.tsx` | hooks exist in `sessions.ts` — page not wired yet |
| Dashboard | `dashboard/organizations/[orgId]/page.tsx` | extend `organizations.ts` |
| Dashboard | `dashboard/organizations/[orgId]/settings/page.tsx` | extend `organizations.ts` |
| Other | `invite/[token]/page.tsx` | new or extend `organizations.ts` |

### Other legacy patterns (not `lib/api`) — 3 files

| Area | File | Pattern |
| --- | --- | --- |
| Admin | `admin/page.tsx` | `useApi` + `apiGetBlob` |
| Admin | `admin/settings/auth/page.tsx` | raw `fetch("/api/admin/settings")` |
| Public | `status/page.tsx` | `useEffect` + `apiGet` + SSE |

**Next batch targets:** `dashboard/sessions` → org detail + settings → `invite/[token]` → auth forms (7) → `admin/page` → `admin/settings/auth` → `status`.


Prioritize pages with real server data, manual `loading/error` state, and repeated `api.get` calls.

| Area | Status | Next action |
| --- | --- | --- |
| shared components using legacy `api.get` | [x] | **Complete** — all listed shared components migrated. |
| pages/layouts using legacy `api` (`@/lib/api` alias) | [x] | **Complete** — zero `from "@/lib/api"` under `packages/ui/src` (2026-07-03). |

### Shared components still on legacy `api`

| Component | API call(s) | Priority |
| --- | --- | --- |
| `NotificationBell.tsx` | notifications | High — visible on every page | [x] |
| `LiveChatWidget.tsx` | `GET /auth/me` + support tickets | Medium | [x] |
| `LocaleSwitcher.tsx` | `PATCH /auth/me` | Medium | [x] |
| `VerifyEmailBanner.tsx` | `GET /auth/me` + resend | Medium | [x] |
| `NpsSurveyPrompt.tsx` | `GET /auth/me/nps/should-prompt` + `POST /auth/me/nps` | Low | [x] |
| `SetupChecklist.tsx` | onboarding-complete mutation | Low | [x] |

### Remaining legacy `api` surfaces (pages/layouts only)

Grep of `from "@/lib/api"` under `packages/ui/src` after page phase batch 3 (2026-07-03):

**Zero** `@/lib/api` alias imports remain under `packages/ui/src`. The six targeted app pages/layouts are migrated.

Note: some app routes still import legacy `api` via relative paths (`../../lib/api`) — auth flows, profile, orgs, api-keys, etc. Those are a follow-up wave; this batch cleared the `@/lib/api` backlog.

**Migrated this batch:** `admin/layout`, `admin/access-reviews` (list + detail), `admin/revenue`, `admin/regions`, `dashboard/search`.

New server-state modules: `accessReviews.ts`, `revenue.ts`, `regions.ts`, `search.ts`.

Previously listed but already migrated before this batch: `admin/sessions`, `admin/alerts`, `dashboard/settings`, `dashboard/account`.

`FeedbackWidget.tsx` uses `apiPost` from `apiClient` directly (not legacy `api`).

## Per-page checklist

For each migrated page:

1. Add/extend a `server-state/<domain>.ts` module with domain query keys, query functions, options, hooks, and mutations.
2. Write a focused test first where practical; make legacy `api.get` throw for GET server data in the test.
3. Replace local server-data `useEffect` + `setLoading`/`setError` state with `useQuery`/domain hooks.
4. Keep client-only state local (forms, filters, selected rows, modal state).
5. Add loading, error + retry, empty, background-refetch, and stale-data UI states.
6. Use `useMutation` for writes; apply optimistic updates only when rollback is straightforward.
7. Invalidate exact domain keys after writes.
8. Run targeted test, targeted Biome check, root type build, and UI build.
9. Update this file plus `todo.md`/`tdone.md` after verification.

## Local verification commands

```bash
NODE_ENV=test bun run --cwd packages/ui test -- <test-file>
bunx biome check --write <touched-files>
bun run build
bun run --cwd packages/ui build
bun run lint
```

## Notes

- On this Windows/MSYS setup, UI component tests need `NODE_ENV=test`; otherwise React may load a production build and fail with `React.act is not a function`.
- Money/date rendering is locale-sensitive; tests should avoid hardcoded `$`/date formats where possible.
