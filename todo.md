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
- **Why:** `openapi.json` currently describes only 57 operations across auth,
  MFA, passkeys, sessions, OAuth, password-reset, admin, and organizations. The
  mounted API exposes ~195 backend routes across 27 route modules — billing,
  wallet, search, compliance, support, feedback, notifications, GDPR, regions,
  and more are invisible to the generated SDK and the static API reference.
- **Acceptance:** Add the billing, wallet, search, compliance, support,
  feedback, notification, GDPR, and region surfaces to `openapi.json`; regenerate
  the SDK (`bun run sdk:generate`) and API reference (`bun run docs:api`); verify
  `bun run verify:generated` passes with the expanded spec.
- **Status:** Pending

### P1.2 — Continue shadcn/ui migration (91 → 0 raw controls)

- **Source:** `docs/shadcn-adoption-report.md`
- **Why:** 91 raw interactive controls remain outside `components/ui/` (56 raw
  buttons, 32 raw inputs, 3 raw textareas). These bypass the design system's
  a11y, focus, and theme conventions.
- **Acceptance:** Migrate the top targets (org settings 17, billing 10, general
  settings 5, JIT 5, orgs 5, help 5) to shadcn primitives. Run
  `bun run ui:audit` to regenerate the report and verify the count drops.
- **Status:** In Progress (162 → 91 over prior passes)

---

## P2 — Maintainability

### P2.1 — Consolidate docs/ dated snapshots

- **Why:** `docs/PROJECT_HISTORY.md` is thin; several docs reference
  `MAINTENANCE_FEATURE_AUDIT.md` which no longer exists. The 2026-06-23 and
  2026-06-24 audit snapshots in `tdone.md` contain stale scope figures (e.g.
  "31 route modules, 53 services, 59 tables") that predate the slim-down.
- **Acceptance:** Remove all broken `MAINTENANCE_FEATURE_AUDIT.md` links; ensure
  every doc references the current standing audit (`docs/AUDIT.md`) or the
  architecture doc (`docs/ARCHITECTURE.md`), not deleted files.
- **Status:** Pending

### P2.2 — OpenTelemetry trace propagation end-to-end test

- **Source:** `docs/AUDIT.md` observability section
- **Why:** `X-Trace-Id` is verified on `/health` but there is no automated test
  that a full request → response → log → trace correlation works across a real
  auth flow.
- **Acceptance:** Add an integration test that performs a login and asserts the
  trace ID appears in both the response header and the structured log output.
- **Status:** Pending

---

## P3 — Scalability & performance

### P3.1 — Auth hot-path: session+user JOIN → 1 round-trip

- **Source:** `tdone.md` "Performance sub-plan"; `docs/AUDIT.md` A-section
- **Why:** `authMiddleware` currently issues separate queries for the session
  and the user. Under load this doubles DB round-trips on the p95 path.
- **Acceptance:** Rewrite as a single JOIN query; add a k6 threshold test
  asserting p95 < 100 ms on the login storm scenario.
- **Status:** Pending

### P3.2 — Optional Redis user-state cache

- **Source:** `tdone.md` "Performance sub-plan"
- **Why:** The user object is fetched from Postgres on every authenticated
  request. A short-TTL Redis cache would eliminate the read on cache hits.
- **Acceptance:** Add `getUserCached(userId)` with 5 s TTL + explicit
  invalidation on profile/role changes; wire into `authMiddleware`; measure
  improvement with k6.
- **Status:** Pending

---

## P4 — Docs & DX

### P4.1 — SDK usage examples

- **Why:** `packages/client/README.md` is minimal. Users don't know how to use
  the generated `@zerotrust/client` SDK.
- **Acceptance:** Add code examples for install, auth (login + token refresh),
  and at least one CRUD call per major resource group.
- **Status:** Pending

### P4.2 — API reference: tag descriptions

- **Why:** `docs/api-reference.md` groups by tag but the tags have no
  descriptive text — just bare names like "Admin" or "MFA".
- **Acceptance:** Add `description` fields to each tag in `openapi.json` so the
  generated reference explains what each group covers.
- **Status:** Pending

---

## Recently completed

See [`tdone.md`](./tdone.md) for the full shipped-feature ledger. Recent
highlights:

- **M1** — `as any` casts reduced 213 → 3 (both remaining are documented
  exceptions); 3 real bugs found and fixed along the way.
- **M2** — Notification dispatcher refactored to a plugin/capability
  (`NotificationAdapter`) pattern; adding a provider is now one module + register.
- **H3** — UI test harness stood up (11 → 58 tests across 8 files).
- **MFA/WebAuthn route tests** — 53 route-level tests added for `mfa.routes.ts`,
  `passkey.routes.ts`, and `verification.routes.ts` (previously zero coverage).
  Full suite: **826 tests, 94 files, all passing**.
