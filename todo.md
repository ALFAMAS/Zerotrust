# zerotrust — TODO

Consolidated, prioritized backlog of work that is **not yet shipped**. Shipped
features live in [`tdone.md`](./tdone.md); the standing audit is
[`docs/AUDIT.md`](./docs/AUDIT.md).

**Priorities:** P0 critical/security · P1 stability/correctness · P2
maintainability/refactor · P3 scalability/performance · P4 docs/DX.
**Status:** Pending · In Progress · Done.

---

## P1 — Correctness & hardening

### P1.1 — Expand OpenAPI spec beyond auth-core

- **Source:** `docs/api-reference.md` coverage note; D5 follow-up in `tdone.md`
- **Why:** `openapi.json` previously described only 57 operations across auth,
  MFA, passkeys, sessions, OAuth, password-reset, admin, and organizations. The
  mounted API exposes many more backend routes across billing, wallet, search,
  compliance, support, feedback, notifications, GDPR, regions, and more.
- **Acceptance:** Add the billing, wallet, search, compliance, support,
  feedback, notification, GDPR, and region surfaces to `openapi.json`; regenerate
  the SDK (`bun run sdk:generate`) and API reference (`bun run docs:api`).
- **Status:** Done — expanded to **115 operations / 20 tag groups**, regenerated
  SDK and API reference, and built the generated client.

### P1.2 — Continue shadcn/ui migration (91 → 0 raw controls)

- **Source:** `docs/shadcn-adoption-report.md`
- **Why:** Raw interactive controls outside `components/ui/` bypass the design
  system's a11y, focus, and theme conventions.
- **Acceptance:** Migrate the top targets (org settings 17, billing 10, general
  settings 5, JIT 5, orgs 5, help 5) to shadcn primitives. Run
  `bun run ui:audit` to regenerate the report and verify the count drops.
- **Status:** Done for this batch — migrated the named top targets and
  regenerated the audit report (**91 → 44 raw controls across 22 files**).

---

## P2 — Maintainability

### P2.1 — Consolidate docs/ dated snapshots

- **Why:** `docs/PROJECT_HISTORY.md` was thin; several docs referenced deleted or
  stale audit snapshots instead of the standing audit.
- **Acceptance:** Remove broken `MAINTENANCE_FEATURE_AUDIT.md` links; ensure docs
  reference the current standing audit (`docs/AUDIT.md`) or architecture doc.
- **Status:** Done — docs now point at the current audit / architecture context.

### P2.2 — OpenTelemetry trace propagation end-to-end test

- **Source:** `docs/AUDIT.md` observability section
- **Why:** `X-Trace-Id` was verified on `/health` but there was no automated test
  that full request → response → log correlation works across a real auth flow.
- **Acceptance:** Add an integration test that performs a login and asserts the
  trace ID appears in both the response header and structured log output.
- **Status:** Done — `src/__tests__/telemetry.middleware.test.ts` covers login
  trace propagation and structured request log correlation.

---

## P3 — Scalability & performance

### P3.1 — Auth hot-path: session+user JOIN → 1 round-trip

- **Source:** `tdone.md` "Performance sub-plan"; `docs/AUDIT.md` A-section
- **Why:** `authMiddleware` issued separate queries for the session and the user,
  doubling DB round-trips on the p95 path.
- **Acceptance:** Rewrite as a single JOIN query; add a k6 threshold test
  asserting p95 < 100 ms on the login storm scenario.
- **Status:** Done — cache-miss path uses one session+user JOIN; focused tests
  cover the hot path; `tests/load/login.k6.js` includes `login_storm` with
  `p(95)<100` threshold.

### P3.2 — Optional Redis user-state cache

- **Source:** `tdone.md` "Performance sub-plan"
- **Why:** The user object was fetched from Postgres on every authenticated
  request. A short-TTL Redis cache eliminates that read on cache hits.
- **Acceptance:** Add `getUserCached(userId)` with 5 s TTL + explicit
  invalidation on profile/role changes; wire into `authMiddleware`; measure
  improvement with k6.
- **Status:** Done — added `userStateCache.service`, wired cache hit/miss paths
  into `authMiddleware`, invalidates on profile/email/avatar/admin role changes,
  and added `tests/load/auth-cache.k6.js` with p95 < 100 ms threshold.

---

## P4 — Docs & DX

### P4.1 — SDK usage examples

- **Why:** `packages/client/README.md` was minimal. Users did not know how to use
  the generated `@zerotrust/client` SDK.
- **Acceptance:** Add code examples for install, auth (login + token refresh),
  and at least one CRUD call per major resource group.
- **Status:** Done — README includes install/import, login, token refresh,
  authenticated usage, major resource examples, error handling, and regeneration
  workflow.

### P4.2 — API reference: tag descriptions

- **Why:** `docs/api-reference.md` grouped by tag but the tags had no descriptive
  text — just bare names like "Admin" or "MFA".
- **Acceptance:** Add `description` fields to each tag in `openapi.json` so the
  generated reference explains what each group covers.
- **Status:** Done — `openapi.json` tag descriptions render in the regenerated
  API reference.

---

## Recently completed

See [`tdone.md`](./tdone.md) for the full shipped-feature ledger. Recent
highlights:

- **Backlog sweep D6** — OpenAPI/SDK docs expanded to 115 operations; SDK README
  examples added; trace correlation tested; auth hot path optimized with JOIN +
  short Redis user cache. Full suite: **832 tests, 97 files, all passing**.
- **P1.2 shadcn batch** — top raw-control targets migrated to shared primitives;
  report now shows **44 raw controls across 22 files**.
- **MFA/WebAuthn route tests** — 53 route-level tests added for `mfa.routes.ts`,
  `passkey.routes.ts`, and `verification.routes.ts`.
