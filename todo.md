# zerotrust — TODO

Consolidated, prioritized backlog of work that is **not yet shipped**. Shipped
features live in [`tdone.md`](./tdone.md); the standing audit is
[`docs/AUDIT.md`](./docs/AUDIT.md). The focused fork-readiness audit is
[`AUDIT-REPORT.md`](./AUDIT-REPORT.md).

**Priorities:** P0 critical/security · P1 stability/correctness · P2
maintainability/refactor · P3 scalability/performance · P4 docs/DX · P5 compliance.
**Status:** Pending · In Progress.

---

## P3 — Scalability and performance

### P3.1 — UI component / integration test coverage toward 85% — _In Progress_

- **Source:** [`docs/AUDIT.md`](./docs/AUDIT.md) T1; [`docs/maintenance-scorecard.md`](./docs/maintenance-scorecard.md) §3
- **Why:** Server-state module tests grew significantly during the TanStack Query
  rollout, but page-level component/integration coverage is still below the 85%
  target. Auth, billing, org, and admin flows need broader regression nets.
- **Acceptance:** Expand `packages/ui` page/component tests for remaining
  high-traffic flows (dashboard home, profile, security/MFA, org settings,
  admin overview, compliance, regions); raise `vitest.config.ts` coverage
  ratchet thresholds incrementally; maintenance scorecard §3 shows ≥85% lines.
- **Status:** In Progress — harness + server-state tests in place; page coverage
  incomplete.

### P3.2 — Default read-heavy endpoints to the read replica — _In Progress_

- **Source:** [`docs/AUDIT.md`](./docs/AUDIT.md) P3
- **Why:** `getReadDb()` exists but is opt-in. List/admin/analytics endpoints
  still hit the primary unless explicitly switched.
- **Acceptance:** Audit all read-only list/detail/analytics handlers; route
  through `getReadDb()` where stale-read is acceptable; add route tests asserting
  replica usage; document replica lag expectations in [`docs/deployment.md`](./docs/deployment.md).
- **Status:** In Progress — sessions, notifications, org lists, and four admin
  list endpoints switched; remaining admin/analytics routes pending.

### P3.3 — Make Elasticsearch optional; default to Postgres FTS — _Pending_

- **Source:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) P3
- **Why:** After the slim-down, searchable surface is users/orgs/tickets and the
  service already has a Postgres fallback. Running ES is an operational burden
  most template forks do not need.
- **Acceptance:** `elasticsearch.enabled` defaults to `false`; search, audit,
  and logging paths use Postgres FTS / file fallback without requiring ES;
  README and deployment docs reflect ES as opt-in for large tenants.
- **Status:** Pending.

### P3.4 — Server-side data fetching (RSC / route handlers) — _Pending_

- **Source:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) P4
- **Why:** TanStack Query eliminated client-side `useEffect` waterfalls, but data
  still fetches in the browser. Next.js 16 RSC + route handlers can cut TTFB and
  client JS for dashboard/admin reads.
- **Acceptance:** Pilot one dashboard and one admin page with server-fetched
  initial data + client hydration for mutations; document the pattern in
  `docs/ui-http-client.md`.
- **Status:** Pending.

### P3.5 — CI gate for destructive migration DDL — _Pending_

- **Source:** [`docs/deployment.md`](./docs/deployment.md) §Release & migration safety;
  [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) P2; ADR 003
- **Why:** Expand/contract discipline is documented (P3.5 docs shipped 2026-07-01),
  but nothing in CI flags new `DROP`/`ALTER … DROP` migrations for human review.
- **Acceptance:** Add a CI step (or pre-commit script) that fails on new
  destructive DDL in `drizzle/` unless an allowlist file explicitly approves it.
- **Status:** Pending — docs done; automation not wired.

---
