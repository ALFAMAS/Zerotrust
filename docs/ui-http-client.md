# UI HTTP client patterns

How the Next.js UI talks to the Hono API — client-side (`apiClient.ts`), server-side
prefetch (`serverApiClient.ts`), and TanStack Query hydration (P3.4 pilot).

---

## Client-side reads and mutations (default)

All browser HTTP goes through [`packages/ui/src/lib/apiClient.ts`](../packages/ui/src/lib/apiClient.ts):

- Attaches the Bearer access token from `localStorage`
- Enforces same-origin `NEXT_PUBLIC_ZEROTRUST_URL`
- Retries transient failures with exponential backoff
- Surfaces a consistent `{ message, code, status }` error shape

TanStack Query hooks in `packages/ui/src/lib/server-state/` wrap `apiGet` /
`apiPost` / etc. Pages import hooks (`useAuthMeQuery`, `useAdminStatsQuery`, …)
rather than calling `fetch` directly.

**When to use:** all client-rendered pages, mutations, and polling/refetch after
the initial server render.

---

## Server-side prefetch (RSC pilot — P3.4)

Two dashboard/admin pages now prefetch authenticated reads on the server:

| Route | Prefetched queries | Client component |
| --- | --- | --- |
| `/dashboard` | `auth/me`, `/sessions` | `DashboardClient.tsx` |
| `/admin` | `/admin/stats`, recent users | `AdminOverviewClient.tsx` |

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
