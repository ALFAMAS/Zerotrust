# SaaS Template Architecture Recommendations — 2026-06-28

This note compares zerotrust against current production-oriented SaaS starter
patterns and recommends maintenance/stability improvements. It is intentionally
architecture-focused rather than feature-count-focused.

## External reference set

- **MakerKit** emphasizes a maintained production foundation: secure
  multi-tenancy, real billing, strict TypeScript/code-quality defaults,
  Playwright E2E tests, monitoring integrations, rich docs, AI-agent rules, MCP
  support, and modular vendor choices for auth/database/payments.
  Source: <https://makerkit.dev/>.
- **supastarter** positions its Next.js kit as a production-ready scalable
  full-stack application with dedicated application surfaces plus auth,
  payments, multi-tenancy, email, storage, analytics, monitoring, and AI
  features. Source: <https://supastarter.dev/docs/nextjs>.
- **BoxyHQ SaaS Starter Kit** is enterprise-focused, with SSO, directory sync,
  audit logs, webhooks/events, API tokens, RBAC, teams, and tenant-oriented
  enterprise workflows. Source: <https://github.com/boxyhq/saas-starter-kit>.
- **ixartz SaaS Boilerplate** is useful as an open-source maintainability
  baseline: typed Next.js, shadcn/Tailwind, auth, multi-tenancy, roles,
  internationalization, database, logging, and tests. Source:
  <https://github.com/ixartz/SaaS-Boilerplate>.

## Current zerotrust baseline

zerotrust is already beyond a basic SaaS template: it has a Hono TypeScript API,
Next.js UI, PostgreSQL/Drizzle, Redis/BullMQ, PASETO tokens, OAuth, passkeys,
MFA, RBAC/ABAC, organizations, Stripe billing, audit chains, metrics, tracing,
Sentry, compliance runbooks, k6 load tests, staging validation, and DR restore
workflows. The main architectural risk is therefore not missing headline
features; it is the cost of maintaining many production-critical surfaces over
time.

## Recommended architecture updates

### P0 — Stabilize release reproducibility and dependency drift

**Recommendation:** make the toolchain and generated artifacts deterministic.

- Pin formatters and code generators to exact versions, starting with Biome.
- Add a scheduled dependency-update workflow with grouped PRs and mandatory
  `bun run lint:ci`, `bun run type-check`, `bun run test`, SDK drift, and UI
  build checks.
- Treat generated artifacts (`packages/client`, OpenAPI, docs API reference,
  shadcn adoption report) as owned outputs with one `verify:generated` script.
- Require CI on `main` and block direct pushes to `main`.

**Why:** production SaaS templates that survive framework churn sell an upgrade
path, not only starter code. zerotrust already has many generated or tool-owned
surfaces, so deterministic updates are the highest-leverage stability win.

### P0 — Introduce explicit bounded modules and dependency direction checks

**Recommendation:** formalize module boundaries around stable domain packages:

- `identity` — users, sessions, tokens, password, OAuth, MFA, WebAuthn.
- `tenancy` — organizations, teams, invitations, roles, ABAC/JIT.
- `billing` — Stripe lifecycle, tax, plans, wallet/points.
- `compliance` — audit chain, access reviews, retention, privacy, SIEM.
- `ops` — metrics, tracing, alerting, health, backups, SLOs.
- `integrations` — webhooks, notifications, email, storage, SSF, SAML/SCIM.

Add an import-boundary check (dependency-cruiser, eslint-plugin-boundaries, or a
small `tsx` script) so routes depend on services, services depend on repositories
or domain modules, and cross-domain calls go through explicit ports.

**Why:** compared with MakerKit and supastarter, zerotrust has deeper security
and compliance breadth. Without enforced boundaries, every new auth/billing/admin
feature increases regression risk across unrelated domains.

### P0 — Add a repository/transaction layer for hot-path writes

**Recommendation:** move direct Drizzle writes out of high-risk services/routes
into repositories with explicit transaction APIs.

Prioritize:

1. refresh-token/session rotation and reuse detection,
2. Stripe webhook event processing,
3. audit-chain append operations,
4. organization membership and role transitions,
5. wallet/points ledger mutations.

**Why:** the existing audit notes already call out refresh-session accumulation
and Stripe webhook idempotency risks. A repository/transaction layer makes these
flows easier to test under retries and concurrent requests.

### P1 — Centralize background jobs and idempotency

**Recommendation:** create a first-class job subsystem instead of scattered
service-level queue usage.

- Define job names, payload schemas, retry/backoff policies, dead-letter
  behavior, and idempotency keys in one module.
- Add idempotency tables for Stripe events, webhook deliveries, email sends,
  notification fan-out, and long-running compliance exports.
- Expose job health in `/metrics` and admin ops pages.

**Why:** production SaaS templates commonly include billing, email, webhooks,
and audit logs; zerotrust includes all of them, but stability depends on exactly
once-or-effectively-once behavior under retries.

### P1 — Convert enterprise features into capability plugins

**Recommendation:** keep the default runtime small by making enterprise-heavy
capabilities optional modules with explicit enablement:

- SAML/OIDC enterprise federation,
- SCIM/directory sync,
- Elasticsearch/SIEM fan-out,
- WhatsApp/SMS/Telegram OTP,
- object storage providers,
- advanced globalization/tax providers.

Each plugin should publish: config schema, health check, migrations, test
fixtures, admin UI registration, and failure-mode documentation.

**Why:** BoxyHQ's enterprise scope is valuable, but always-on enterprise breadth
can make routine maintenance harder. A plugin contract preserves zerotrust's
enterprise story while reducing local-dev and deployment complexity.

### P1 — Move UI/API integration to generated, typed contracts by default

**Recommendation:** make the generated client the only supported UI data access
path.

- Add a lint rule or repo script that blocks ad-hoc `fetch()` calls to API routes
  from the UI except through an approved API client.
- Add contract tests that verify key UI pages only call routes present in the
  OpenAPI spec.
- Keep the API/UI integration matrix as a required drift check.

**Why:** zerotrust has a broad backend surface and multiple admin consoles.
Generated contracts reduce the maintenance cost of endpoint changes and help
prevent silent frontend drift.

### P1 — Add component/integration test layers for the UI

**Recommendation:** add a Vitest browser or happy-dom project with Testing
Library for components and page-level state flows.

Prioritize:

- login/register/reset MFA states,
- organization role and invite forms,
- billing/plan gates,
- admin user/session/audit tables,
- notification and webhook setup flows.

**Why:** Playwright E2E is already valuable but expensive. Component tests catch
most dashboard regressions faster, which matters for a template with many pages.

### P2 — Publish an operational reference architecture

**Recommendation:** add deployment blueprints for the three realistic production
modes:

1. single VM/PM2/nginx for small teams,
2. container platform with managed Postgres/Redis/object storage,
3. Kubernetes with separate web/API/workers, HPA, and external secrets.

Include queue worker topology, migration ordering, rollback strategy, backup
restore RTO/RPO, and service dependency diagrams.

**Why:** README and deployment docs cover local and staging flows. Production
buyers need a target operating model that explains how the API, UI, workers,
Redis, Postgres, object storage, tracing, metrics, and Sentry fit together.

### P2 — Add ADRs and a maintenance scorecard

**Recommendation:** add lightweight architecture decision records for the choices
that future maintainers are most likely to revisit:

- PASETO instead of JWT,
- Hono API separate from Next.js app,
- Drizzle/Postgres as source of truth,
- Redis/BullMQ queue model,
- generated client/OpenAPI workflow,
- localStorage token tradeoff or cookie migration plan,
- plugin/module boundary strategy.

Track a quarterly scorecard: dependency freshness, CI duration, flaky tests,
coverage by domain, migration health, mean restore time, p95 smoke latency, and
open security exceptions.

**Why:** MakerKit's public differentiators include long-term maintenance,
upgradeability, docs, and agent guidance. ADRs and scorecards turn those claims
into maintainable engineering process for zerotrust.

## Suggested implementation order

1. **Week 1:** exact-pin Biome/tooling; add `verify:generated`; enforce CI on
   `main`; add Stripe webhook idempotency persistence.
2. **Week 2:** define domain boundaries and add import-boundary CI; introduce
   repository APIs for sessions/tokens and billing events.
3. **Week 3:** centralize BullMQ jobs and idempotency schemas; add UI component
   test project for auth/org/billing flows.
4. **Week 4:** document deployment reference architectures; split optional
   enterprise integrations behind plugin capability contracts.
5. **Ongoing:** ADRs for major decisions; quarterly maintenance scorecard; keep
   competitor-template review as a release-planning input rather than a feature
   checklist.
