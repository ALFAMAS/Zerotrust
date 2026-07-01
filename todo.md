# zerotrust — TODO

Consolidated, prioritized backlog of work that is **not yet shipped**. Shipped
features live in [`tdone.md`](./tdone.md); the standing audit is
[`docs/AUDIT.md`](./docs/AUDIT.md).

**Priorities:** P0 critical/security · P1 stability/correctness · P2
maintainability/refactor · P3 scalability/performance · P4 docs/DX.
**Status:** Pending · In Progress.

---

## Current backlog

No pending backlog items. The previously implemented P1/P2/P3/P4 work has been
moved to [`tdone.md`](./tdone.md).

---

## Recently shipped

See [`tdone.md`](./tdone.md) for the full shipped-feature ledger. Recent
highlights:

- **Backlog sweep D6** — OpenAPI/SDK docs expanded to 115 operations; SDK README
  examples added; trace correlation tested; auth hot path optimized with JOIN +
  short Redis user cache. Full suite: **832 tests, 97 files, all passing**.
- **P1.2 shadcn batch** — top raw-control targets migrated to shared primitives;
  report now shows **44 raw controls across 22 files**.
- **Admin audit logs empty-state fix** — removed sample/mock fallback rows so an
  empty `/admin/audit-logs` response renders "No audit entries found."
