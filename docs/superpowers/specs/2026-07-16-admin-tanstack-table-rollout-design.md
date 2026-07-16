# Admin TanStack Table Rollout Design

**Date:** 2026-07-16  
**Status:** Approved for implementation planning

## Context

The admin users screen already uses the shared `DataTable` wrapper around
`@tanstack/react-table`, but sessions, audit logs, and webhook deliveries still
render hand-written tables. The shared wrapper currently provides sorting and
column visibility only. This cycle completes the intended rollout across the
four high-use admin data surfaces and gives the shared component the remaining
product-grade table capabilities without changing API contracts.

## Goals

- Migrate admin sessions, audit logs, and webhook deliveries to the shared
  TanStack table foundation.
- Add optional search, row selection, stable row IDs, and toolbar actions to
  `DataTable` while preserving sorting and column visibility.
- Keep server pagination, fetching, mutations, and error handling in each page.
- Preserve every existing user-visible action and status treatment.
- Improve audit-log detail access with an explicit keyboard-accessible action.
- Establish focused column-definition modules so page components own data flow
  and column modules own table presentation.

## Non-goals

- No API, database, pagination-envelope, or query-key changes.
- No cross-page sorting, filtering, or selection. Search and sorting apply only
  to the rows currently loaded by the page.
- No new bulk destructive action. Selection is an optional shared capability;
  screens only enable it when they provide a meaningful, safe toolbar action.
- No migration of unrelated dashboard tables in this cycle.
- No visual redesign of the surrounding page headers, charts, dialogs, tabs,
  cards, or pagination controls.

## Shared component design

`packages/ui/src/components/ui/data-table.tsx` remains the single integration
boundary for TanStack Table and the existing shadcn table primitives.

The component will retain its current `columns`, `data`, `isLoading`,
`emptyMessage`, and `initialColumnVisibility` inputs and add optional inputs for:

- a global search field and accessible placeholder;
- `getRowId`, so selection remains stable when the table is sorted or filtered;
- controlled or internally managed row selection;
- an optional toolbar renderer that receives the table instance and selected
  rows;
- an optional table label for screen-reader context.

When search is enabled, `getFilteredRowModel()` filters only the supplied data.
The UI will clearly sit inside the current page rather than implying a search
over every server page. Sorting similarly remains client-side over supplied
rows. Column visibility continues to use TanStack state and the existing Radix
dropdown.

Selection checkboxes will use the shared checkbox primitive, include accessible
labels, and support select-all for the currently filtered rows. Selection is
disabled by default. A page that enables selection must provide stable IDs and
a meaningful toolbar action; otherwise it gains search, sorting, and visibility
without checkboxes.

Loading and empty states remain table rows so column widths and surrounding
layout do not jump. The empty state distinguishes between no supplied data and
no rows matching the current search.

## Page migrations

### Admin users

The existing migration stays in place. It will adopt any compatible shared API
changes and serve as a regression target. No new user mutation is introduced.

### Admin sessions

Move column definitions and cell formatting into a sibling `columns.tsx`.
Columns preserve user identity, device trust, location, timestamps, status,
anomaly indicators, and the per-row revoke action. The existing All/Active/
Expired tabs filter the loaded server page before data reaches `DataTable`.
Search covers the displayed user, device, IP, country, and status values.
Pagination remains owned by `SessionsClient`.

The revoke mutation remains a per-row action with its existing pending state and
toast behavior. Selection will not be enabled because this cycle does not add a
bulk-revoke API or multi-mutation workflow.

### Admin audit logs

Move audit value normalization and table columns behind focused helpers while
leaving chart aggregation in `auditData.ts`. Search covers actor, action, IP,
and status. Sorting is available for timestamp, actor, action, IP, and status.

Replace the pointer-only clickable row with an explicit `View details` action
that opens the existing dialog. This preserves native table semantics and gives
keyboard and assistive-technology users a clear control. Integrity verification,
the volume chart, and detail rendering are unchanged.

### Admin webhook deliveries

Keep the webhook-ID lookup form and server query unchanged. Once a webhook is
loaded, render deliveries through `DataTable`. Search covers event, status,
attempt, response status, and recorded time. Sorting and visibility apply to
the loaded delivery records. Selection is disabled because the page has no row
mutation.

The existing loading skeleton remains before query data exists. `DataTable`
owns only the populated and empty result rendering inside the results card.

## Data flow

Each page continues to call its canonical TanStack Query hook. The page derives
the current data slice and page-specific filters, then supplies rows and column
definitions to `DataTable`. Table state never triggers a second API path in this
cycle. Mutations continue through existing server-state hooks, and page-owned
callbacks are passed into column factories where a cell needs an action.

## Error handling and accessibility

Existing query-level `ErrorState`, retry controls, mutation toasts, and pending
states remain authoritative. Table search cannot throw or issue network calls.
Column action callbacks retain page-owned `try`/`catch` behavior.

All toolbar fields have visible or programmatic labels. Sort controls remain
native buttons and expose their state through accessible text or attributes.
Visibility and selection use Radix/shadcn controls. Empty search results are
announced as text. Audit detail access uses a native button instead of relying
on a row click. Focus management for the audit dialog remains with Radix.

## Testing strategy

Implementation follows red-green-refactor:

1. Add shared `DataTable` tests that first fail for global search, stable row
   selection, select-all over filtered rows, toolbar rendering, sorting, column
   visibility, loading, and differentiated empty states.
2. Add or extend page tests that first fail until sessions, audit logs, and
   webhook deliveries render through the intended behavior and preserve their
   actions.
3. Implement the smallest shared API and each migration needed to make those
   tests pass.
4. Run focused UI tests after each migration, then the full UI suite, type
   checking, Biome checks, and a production Next.js build.
5. Verify the three pages in a running app when local services and fixtures are
   available, including keyboard search, sorting, visibility, audit detail, and
   session revoke pending behavior.

Tests will assert user-observable behavior rather than TanStack internals.

## Completion criteria

- Users, sessions, audit logs, and webhook deliveries all use the shared
  `DataTable` integration.
- The shared component supports optional search, sorting, visibility, stable
  selection, and toolbar actions with accessible controls.
- Existing pagination, tabs, lookup, integrity verification, dialogs, charts,
  and mutations behave as before.
- Focused and full verification commands pass without new warnings.
- No security-sensitive fetch, redirect, logging, upload, command, crypto, or
  authorization behavior is introduced or bypassed.
