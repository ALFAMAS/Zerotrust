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

|- **E3 — shadcn cleanup (in progress)** — 44 → **8 raw controls** across 8 files.
- **E3 secondary:** Remaining: dashboard/profile, dashboard/search, dashboard/settings, dashboard/webhooks, admin/sessions, components/AppSidebar, CommandPalette, ErrorBoundary.

- **E2 — `useApi` adoption** — Partially complete: migrated access-reviews, alerts, admin overview. ~15 more pages with repetitive useEffect+api.get patterns remain.

### P4 — docs / claims hygiene

- **Bun runtime bump review** — `.bun-version` pins Bun 1.2.23; consider bumping
  after confirming the `CompressionStream` guard is no longer needed.

---

## Recently shipped

See [`tdone.md`](./tdone.md) for the full shipped-feature ledger. Recent
highlights:

- **Audit-report must-fix sweep** — UI build/lint blockers fixed, B1-B6
  frontend/backend contract drift resolved, B7/B8 verified, C2 made explicit with
  `@elastic/elasticsearch`, B9 admin session pagination added, and webhook
  endpoints moved to DB persistence. Verification: **838 tests / 99 files
  passing**, plus build, lint, type-check, UI build, generated docs, and boundary
  checks.
- **E1 UI HTTP client boundary** — `apiClient.ts` is documented as canonical for
  new UI→API calls, now exposes PATCH/PUT helpers and transient retry coverage,
  and `useApi` uses it internally. `api.ts` remains legacy compatibility while
  older pages are migrated under E2.
- **C1 smart search claim fix** — `/search/smart` now uses ranked PostgreSQL
  full-text search across users, orgs, and support tickets when Elasticsearch is
  unavailable; semantic/vector claims were removed from OpenAPI/generated docs.
- **C3 hardware key-store claims** — README directory-tree comment softened from
  "hardware key store" to "software key store (hardware providers are stubs)".
- **C4/C5/C6/C7 backend-feature UI exposure** — Added OAuth "Connect" button to
  the security page for unlinked providers; added per-category × per-channel
  notification preference toggles (5 categories × 3 channels) to the
  notifications page; confirmed `/auth/me/nps` and `/auth/me/onboarding-complete`
  routes exist in `auth.routes.ts`; added customer segment selector to the admin
  user detail page calling `PUT /admin/users/:id/segment`.
- **Backlog sweep D6** — OpenAPI/SDK docs expanded to 115 operations; SDK README
  examples added; trace correlation tested; auth hot path optimized with JOIN +
  short Redis user cache.
- **P1.2 shadcn batch** — top raw-control targets migrated to shared primitives;
  report now shows **44 raw controls across 22 files**.
- **Admin audit logs empty-state fix** — removed sample/mock fallback rows so an
  empty `/admin/audit-logs` response renders "No audit entries found."
