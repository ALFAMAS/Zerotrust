# UI HTTP client patterns

How the Next.js UI talks to the Hono API — client-side (`apiClient.ts`), TanStack
Query server-state modules, server-side prefetch (`serverApiClient.ts`), and
hydration.

---

## TanStack Query server-state (default for pages)

All page-level reads and writes go through domain modules in
[`packages/ui/src/lib/server-state/`](../packages/ui/src/lib/server-state/):

| Layer | Role |
| --- | --- |
| `queryKeys.ts` | Hierarchical cache keys (`queryKeys.auth.me()`, `queryKeys.organizations.detail(id)`, …) |
| `<domain>.ts` | `fetch*` helpers, `queryOptions`, `use*Query`, `use*Mutation` |
| `types.ts` | Shared response/input types |
| `prefetch.ts` | RSC-safe fetchers + `queryOptions` for server prefetch |
| `QueryProvider.tsx` | Single app-level `QueryClientProvider` (30s stale time, no refetch on focus) |

Pages import hooks (`useAuthMeQuery`, `useOrganizationsListQuery`, …) — not
`apiGet`/`apiPost` directly. One-off utilities (`push.ts`, `pow.ts`) may call
`apiClient` without TanStack Query when there is no cached server state.

**Adding a domain hook** (see `apiKeys.ts`):

```ts
export function apiKeysListQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.apiKeys.list(),
    queryFn: fetchApiKeysList,
  });
}

export function useApiKeysListQuery() {
  return useQuery(apiKeysListQueryOptions());
}

export function useRevokeApiKeyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiDelete(buildApiKeyPath(id)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.list() });
    },
  });
}
```

Write-only surfaces (e.g. `feedback.ts`) export mutation hooks only.

---

## Client-side HTTP transport

All browser HTTP goes through [`packages/ui/src/lib/apiClient.ts`](../packages/ui/src/lib/apiClient.ts):

- Attaches the Bearer access token from `localStorage`
- Enforces same-origin `NEXT_PUBLIC_ZEROTRUST_URL`
- Retries transient failures with exponential backoff
- Surfaces a consistent `{ message, code, status }` error shape

Used by server-state fetchers and mutations. Do not call from page components for
cached resources — use the matching `use*Query` / `use*Mutation` hook instead.

**When to use:** mutations/queries inside `server-state/*`, utilities without
cache needs, and polling/refetch after the initial server render.

---

## Legacy note

`packages/ui/src/lib/hooks/useApi.ts` has been removed. All product pages use
TanStack Query via `server-state/*`. See
[`docs/tanstack-query-progress.md`](./tanstack-query-progress.md).

---

## Server-side prefetch (RSC)

Ten high-traffic dashboard/admin pages prefetch authenticated reads on the server:

| Route | Prefetched queries | Client component |
| --- | --- | --- |
| `/dashboard` | `auth/me`, `/sessions` | `DashboardClient.tsx` |
| `/admin` | `/admin/stats`, recent users | `AdminOverviewClient.tsx` |
| `/dashboard/wallet` | `/wallet`, `/wallet/transactions` | `WalletClient.tsx` |
| `/dashboard/billing` | subscription, currencies, pricing (USD/en-US) | `BillingClient.tsx` |
| `/admin/users` | paginated users list (page 1) | `UsersClient.tsx` |
| `/admin/sessions` | paginated sessions list (page 1) | `SessionsClient.tsx` |
| `/dashboard/security` | `auth/me` | `SecurityClient.tsx` |
| `/dashboard/settings` | `/auth/oauth/providers` | `SettingsClient.tsx` |
| `/dashboard/organizations` | `/orgs`, `/orgs/invites/mine` | `OrganizationsClient.tsx` |
| `/admin/audit` | `/admin/audit-logs` | `AuditClient.tsx` |

### How it works

1. **`page.tsx` (Server Component)** — creates a `QueryClient`, prefetches via
   [`packages/ui/src/lib/server-state/prefetch.ts`](../packages/ui/src/lib/server-state/prefetch.ts),
   wraps the client tree in `<HydrationBoundary state={dehydrate(queryClient)}>`.

2. **`serverApiClient.ts`** — server-side `fetch` that reads the mirrored
   `za_access_token` cookie (set alongside `localStorage` in `setToken()`).

3. **Client component** — uses the same TanStack Query hooks as before; hydrated
   cache means no loading skeleton on first paint when prefetch succeeded.
   Mutations still run client-side via `apiClient.ts`.

### Auth cookie mirror

`packages/ui/src/lib/auth.ts` writes `za_access_token` to a first-party cookie
when the user logs in so RSC can authenticate server prefetch. The cookie is
cleared on logout. It mirrors the access token already in `localStorage`; it is
not httpOnly (same threat model as localStorage-based SPA auth).

### Adding a new server-prefetched page

1. Extract the interactive UI into a `"use client"` component (e.g. `FooClient.tsx`).
2. Add fetchers + `queryOptions` to `prefetch.ts` (no `"use client"` — safe for RSC).
3. In `page.tsx`:

```tsx
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { fooPrefetchOptions } from "@/lib/server-state/prefetch";
import FooClient from "./FooClient";

export default async function FooPage() {
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery(fooPrefetchOptions()).catch(() => undefined);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <FooClient />
    </HydrationBoundary>
  );
}
```

4. Keep mutations in the client component; invalidate query keys on success as today.

**Prefetch failures:** `.catch(() => undefined)` lets unauthenticated first visits
fall through — the client component shows the normal error/loading states.

---

## Testing

- **Component tests:** mock `@/lib/apiClient` via `@/test/apiClientMock` (see
  `packages/ui/src/test/setup.ts`). Test the client component, not the RSC wrapper.
- **Server prefetch:** unit-test fetchers in `prefetch.ts` by mocking
  `serverApiGet` if needed; integration coverage comes from client component tests
  sharing the same query keys.

Run UI tests:

```bash
NODE_ENV=test bun run --cwd packages/ui test
```

---

## Related docs

- [`docs/deployment.md`](./deployment.md) — read replica routing, optional Elasticsearch
- [`docs/maintenance-scorecard.md`](./maintenance-scorecard.md) §3 — coverage targets
- [`CLAUDE.md`](../CLAUDE.md) — canonical `apiClient` module table
