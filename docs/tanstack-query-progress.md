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

## Migration backlog

Prioritize pages with real server data, manual `loading/error` state, and repeated `api.get` calls.

| Area | Status | Next action |
| --- | --- | --- |
| `/dashboard/support` | [ ] | Add support tickets/messages keys/hooks, migrate ticket list/detail, optimistic message append where safe. |
| `/admin/audit` | [ ] | Add admin audit keys/hooks, migrate log list + integrity verification fetch with clear empty/error states. |
| `/admin/tenants` | [ ] | Add admin tenants keys/hooks, migrate tenant list and region updates. |
| `/admin/jit` | [ ] | Add JIT keys/hooks, migrate incoming request list and approval/deny invalidation. |
| `/admin/compliance` | [ ] | Add compliance keys/hooks, migrate SOC2/risk data fan-out. |
| `/admin/anomaly` | [ ] | Add anomaly keys/hooks, migrate baseline list and status actions. |
| `/admin/settings/general` | [ ] | Add settings keys/hooks, migrate app settings load/save. |
| `/admin/users/[id]` | [ ] | Add admin user detail key/hook, optimistic status/segment updates. |
| shared components using legacy `api.get` | [ ] | Migrate high-impact reusable server-data components after page migrations. |

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
