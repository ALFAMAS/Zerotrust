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

- **E1 — UI HTTP client consolidation** — decide whether `packages/ui/src/lib/api.ts`
  or `packages/ui/src/lib/apiClient.ts` is canonical, then migrate/document the
  split so new UI code has one clear API-call pattern.

### P2 — product completeness / template polish

- **C1 — Smart search claim** — either implement real semantic search for
  `/search/smart` or remove the semantic-search claim/endpoint until it is real.
- **C4/C5/C7 — Surface backend-only features in UI** — linked OAuth account
  management, granular notification preferences, and customer segment controls
  exist backend-side but need dashboard/admin exposure or docs marking them API-only.
- **E2 — `useApi` adoption** — migrate repetitive dashboard/admin
  `useEffect + api.get + loading` boilerplate to `useApi` / `usePaginatedApi` in
  focused batches.
- **E3 — shadcn cleanup** — continue reducing the 44 raw controls reported in
  `docs/shadcn-adoption-report.md`.

### P4 — docs / claims hygiene

- **C3 — Hardware key-store claims** — either productize TPM/Secure Enclave/PKCS#11
  providers or soften post-quantum/hardware-backed crypto claims to reflect that
  only the software provider is functional.
- **Bun runtime bump review** — `.bun-version` pins Bun 1.2.23; consider bumping
  after confirming the `CompressionStream` guard is no longer needed.

---

## Recently shipped

See [`tdone.md`](./tdone.md) for the full shipped-feature ledger. Recent
highlights:

- **Audit-report must-fix sweep** — UI build/lint blockers fixed, B1-B6
  frontend/backend contract drift resolved, B7/B8 verified, C2 made explicit with
  `@elastic/elasticsearch`, B9 admin session pagination added, and webhook
  endpoints moved to DB persistence. Verification: **835 tests / 99 files
  passing**, plus build, lint, type-check, UI build, generated docs, and boundary
  checks.
- **Backlog sweep D6** — OpenAPI/SDK docs expanded to 115 operations; SDK README
  examples added; trace correlation tested; auth hot path optimized with JOIN +
  short Redis user cache.
- **P1.2 shadcn batch** — top raw-control targets migrated to shared primitives;
  report now shows **44 raw controls across 22 files**.
- **Admin audit logs empty-state fix** — removed sample/mock fallback rows so an
  empty `/admin/audit-logs` response renders "No audit entries found."
