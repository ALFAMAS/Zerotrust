# Admin TanStack Table Rollout Implementation Plan

**Design:** `docs/superpowers/specs/2026-07-16-admin-tanstack-table-rollout-design.md`

## Task 1: Extend the shared DataTable contract

**Files**

- Add: `packages/ui/src/components/ui/data-table.test.tsx`
- Modify: `packages/ui/src/components/ui/data-table.tsx`

**Red**

Add behavior tests for:

- search filtering with explicit current-page helper text;
- a distinct no-match state;
- ascending and descending sorting;
- column visibility toggling;
- opt-in selection with stable row IDs;
- select-all limited to filtered rows;
- toolbar rendering with selected rows;
- loading and empty rows using the visible column count.

Run:

```powershell
bun run --cwd packages/ui test -- src/components/ui/data-table.test.tsx
```

Confirm each new assertion fails because the capability is absent.

**Green**

Add the smallest optional API needed by the tests, using TanStack's
`getFilteredRowModel`, `RowSelectionState`, and table instance rather than
reimplementing table state. Reuse the shared Input and Checkbox primitives.

Run the focused test until green, then refactor names and duplicated rendering
without adding behavior.

## Task 2: Migrate admin sessions

**Files**

- Modify: `packages/ui/src/app/admin/sessions/page.test.tsx`
- Add: `packages/ui/src/app/admin/sessions/columns.tsx`
- Modify: `packages/ui/src/app/admin/sessions/SessionsClient.tsx`

**Red**

Extend the page tests to require the current-page search UI, filtering by user
or device, sortable headers, the columns control, preserved status/anomaly
content, and the existing revoke mutation.

Run:

```powershell
bun run --cwd packages/ui test -- src/app/admin/sessions/page.test.tsx
```

**Green**

Extract pure format/status helpers and a `createSessionColumns` factory. Replace
the hand-written table with `DataTable`; keep tabs, pagination, query state,
toast handling, and revoke ownership in `SessionsClient`.

## Task 3: Migrate admin audit logs

**Files**

- Add: `packages/ui/src/app/admin/audit/page.test.tsx`
- Add: `packages/ui/src/app/admin/audit/columns.tsx`
- Modify: `packages/ui/src/app/admin/audit/AuditClient.tsx`
- Modify only if needed: `packages/ui/src/app/admin/audit/auditData.ts`

**Red**

Add page tests for search, sortable headers, column visibility, the explicit
`View details` action, dialog contents, integrity verification, and the empty
state.

Run:

```powershell
bun run --cwd packages/ui test -- src/app/admin/audit/page.test.tsx src/app/admin/audit/auditData.test.ts
```

**Green**

Move table normalization and column rendering into focused helpers and a column
factory. Replace row click activation with the native action button. Leave the
chart, verification query, and Radix dialog behavior in `AuditClient`.

## Task 4: Migrate admin webhook deliveries

**Files**

- Add: `packages/ui/src/app/admin/webhooks/page.test.tsx`
- Add: `packages/ui/src/app/admin/webhooks/columns.tsx`
- Modify: `packages/ui/src/app/admin/webhooks/page.tsx`

**Red**

Add page tests for the webhook lookup query, loading/error/empty states, search,
sorting, visibility, and preserved status badges.

Run:

```powershell
bun run --cwd packages/ui test -- src/app/admin/webhooks/page.test.tsx
```

**Green**

Extract delivery columns and replace the populated/empty hand-written table with
`DataTable`. Keep the lookup form, query boundary, skeleton, and retry control in
the page.

## Task 5: Regression and production verification

Run focused tests together:

```powershell
bun run --cwd packages/ui test -- src/components/ui/data-table.test.tsx src/app/admin/users/page.test.tsx src/app/admin/sessions/page.test.tsx src/app/admin/audit/page.test.tsx src/app/admin/audit/auditData.test.ts src/app/admin/webhooks/page.test.tsx
```

Then run:

```powershell
bun run --cwd packages/ui test
bun run type-check
bun run lint:ci
bun run boundaries:check
bun run knip
bun run --cwd packages/ui build
```

If the local application services are available, verify keyboard search,
sorting, column visibility, audit detail focus, and session revoke behavior in
the running UI. Inspect the final diff against the repository security table,
then commit the completed table cycle as a logical feature commit.
