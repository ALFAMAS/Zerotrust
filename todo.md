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

- **E2 — `useApi` adoption** — Partial (~4/40 app pages): `admin/page`,
  `admin/access-reviews`, `admin/alerts`, and `dashboard/settings` use
  `useApi`/`usePaginatedApi`. ~20 dashboard/admin pages still import legacy
  `@/lib/api` and hand-roll `useEffect` + `api.get` + loading/error state
  (e.g. webhooks, sessions, billing, wallet, admin users/sessions/audit).

### P4 — docs / claims hygiene

- **Bun runtime bump review** — `.bun-version` pins Bun 1.2.23; `server.ts`
  guards `compress()` on missing `CompressionStream`. Bump Bun (≥ 1.3) and
  re-verify compression + CI after confirming the guard can be removed.

---
