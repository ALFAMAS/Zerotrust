# zerotrust — Current TODO

## Environment / verification blockers

- [ ] Repair the local Bun/Windows `node_modules` junction state so full `bun run type-check`, `bun run lint`, `bun run build`, and `bun run test` can run locally again. Current CWE/fetch hardening verification used `bunx biome check` on touched files and `bun build --packages external` because the local install reports workspace symlink/EACCES issues.
  - Latest blocker: `bun run build` cannot resolve `node_modules/typescript/lib/tsc.js`, local `biome` shim cannot resolve, `bunx vitest run ...` cannot resolve `vitest/config`, and importing modules that depend on `nanoid` can hit `EACCES`; use CI/full reinstall to run the complete suite. CWE-601 verification used Biome-on-touched-files, `bun build --packages external`, and direct safeRedirect smoke checks.

## SaaS template architecture maintenance / stability backlog

Based on the production-ready SaaS template architecture review, prioritize stability and maintenance work over adding more headline features.

### P0 — Release reproducibility and dependency drift

- [ ] Pin formatters and code generators to exact versions, starting with `@biomejs/biome` and any generated-client/doc tooling.
- [ ] Add a single `verify:generated` script that checks OpenAPI output, `packages/client`, API docs/reference output, and shadcn adoption reports for drift.
- [ ] Add a scheduled dependency-update workflow with grouped PRs and required `bun run lint:ci`, `bun run type-check`, `bun run test`, SDK drift, and UI build checks.
- [ ] Require CI on `main` and block direct pushes so formatting or generated-output drift cannot land outside PR gates.

### P0 — Bounded modules and dependency direction

- [ ] Define explicit domain module boundaries for `identity`, `tenancy`, `billing`, `compliance`, `ops`, and `integrations`.
- [ ] Add an import-boundary check in CI so API routes depend on services/domain ports, services do not reach across unrelated domains directly, and cross-domain calls go through explicit interfaces.
- [ ] Document the expected dependency direction in an ADR before moving code so future feature work has a stable target architecture.

### P0 — Repository and transaction layer for hot-path writes

- [ ] Introduce repository/transaction APIs for refresh-token rotation, session lifecycle, and token-reuse detection.
- [ ] Add Stripe webhook event idempotency persistence and process billing mutations through a transaction boundary.
- [ ] Move audit-chain appends behind a repository that enforces atomic append/verify behavior.
- [ ] Move organization membership/role transitions behind repository methods with explicit authorization and transactional invariants.
- [ ] Move wallet/points ledger mutations behind append-only ledger repository methods and tests.

### P1 — Background jobs and idempotency

- [ ] Create a centralized jobs module with job names, Zod payload schemas, retry/backoff policies, dead-letter behavior, and idempotency-key conventions.
- [ ] Add idempotency records for Stripe events, webhook deliveries, email sends, notification fan-out, and long-running compliance exports.
- [ ] Expose queue/job health in `/metrics` and the admin operations UI.

### P1 — Optional enterprise capability modules

- [ ] Define a plugin/capability contract for enterprise-heavy integrations: config schema, health check, migrations, fixtures, admin UI registration, and failure-mode docs.
- [ ] Apply the contract to optional providers such as Elasticsearch/SIEM fan-out, SMS/WhatsApp/Telegram OTP, object storage providers, and advanced tax/globalization providers.
- [ ] Keep removed enterprise federation surfaces documented as intentionally out of scope unless reintroduced behind the same plugin/capability contract.

### P1 — Typed UI/API contracts

- [ ] Make the generated TypeScript API client the default and preferred UI data access path.
- [ ] Add a lint or repository check that blocks ad-hoc UI `fetch()` calls to backend routes unless they go through an approved API client wrapper.
- [ ] Add contract tests to verify key UI pages only call routes present in `src/api/openapi.json`.
- [ ] Keep the API/UI integration matrix as a required drift check.

### P1 — UI component and integration tests

- [ ] Add a Vitest browser or `happy-dom` project with Testing Library for React components and page-level state flows.
- [ ] Prioritize tests for login/register/reset/MFA states, organization role and invite forms, billing/plan gates, admin user/session/audit tables, and notification/webhook setup flows.

### P2 — Operational reference architecture

- [ ] Publish deployment blueprints for: single VM/PM2/nginx, container platform with managed Postgres/Redis/object storage, and Kubernetes with separate web/API/workers.
- [ ] Include queue worker topology, migration ordering, rollback strategy, backup restore RTO/RPO, and service dependency diagrams.

### P2 — ADRs and maintenance scorecard

- [ ] Add ADRs for PASETO vs JWT, separate Hono API vs Next.js API routes, Drizzle/Postgres as source of truth, Redis/BullMQ queues, generated OpenAPI client workflow, token storage tradeoffs, and plugin/module boundary strategy.
- [ ] Track a quarterly maintenance scorecard: dependency freshness, CI duration, flaky tests, domain coverage, migration health, mean restore time, p95 smoke latency, and open security exceptions.
