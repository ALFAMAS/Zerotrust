# zerotrust — TODO

Consolidated, prioritized backlog of work that is **not yet shipped**. Shipped
features live in [`tdone.md`](./tdone.md); the standing audit is
[`docs/AUDIT.md`](./docs/AUDIT.md). The focused fork-readiness audit is
[`AUDIT-REPORT.md`](./AUDIT-REPORT.md).

**Priorities:** P0 critical/security · P1 stability/correctness · P2
maintainability/refactor · P3 scalability/performance · P4 docs/DX.
**Status:** Pending · In Progress.

---

## Current backlog

### P1 — correctness / fork-readiness

- No active P1 audit items.

### P2 — product completeness / template polish

- **E2 — server-state adoption** — Partial: TanStack Query is installed and
  wired through the UI root, with domain query keys/query functions under
  `packages/ui/src/lib/server-state/*`. `dashboard/wallet` and
  `dashboard/webhooks` have migrated to query/mutation hooks with optimistic
  updates, background-refetch, stale-data, loading, error, and empty states.
  Track page-by-page progress in `docs/tanstack-query-progress.md`. Continue
  migrating the remaining dashboard/admin pages that still import legacy
  `@/lib/api` and hand-roll `useEffect` + server data state (e.g. support,
  admin audit/revenue/tenants/regions).
