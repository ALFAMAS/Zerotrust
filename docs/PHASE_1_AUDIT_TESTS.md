# Phase 1 — Audit and Test-Suite Expansion

Date: 2026-06-25  
Goal: turn the audit into enforceable quality gates while closing obvious frontend/backend wiring drift.

## Completed in this phase

| Workstream | Deliverable | Status |
|---|---|---|
| Audit report | Prioritized critical/high findings, concrete fixes, owners, milestones, and staging handoff instructions in the enterprise execution ledger. | Done |
| Coverage gate | Vitest global coverage thresholds raised to 85% and CI runs `bun run test:coverage -- --run`. | Done |
| Security tests | CI now runs dependency audit, Semgrep SAST, and Trivy high/critical filesystem scanning. | Done |
| E2E foundation | CI now has a Playwright job with Postgres/Redis services, app secrets, browser install, and report artifact upload. | Done |
| Load-test guardrail | k6 full-suite thresholds enforce API p95 <100ms, p99 <300ms, plus login/refresh p95 <100ms. | Done |
| Integration audit | Added `scripts/audit-api-ui-map.mjs`, generated `docs/api-ui-integration-matrix.md`, and wired a CI drift check. | Done |
| Broken UI call | Fixed the native live-chat fallback to use the actual support-ticket API contract (`POST /support` and `POST /support/:id/messages`). | Done |

## Phase 1 verification checklist

Run these locally or in CI after dependency installation succeeds:

```bash
bun run lint:ci
bun run type-check
bun run test:coverage -- --run
bun run audit:integration
git diff --exit-code -- docs/api-ui-integration-matrix.md
bun run --cwd packages/ui test:e2e
k6 run tests/load/full-suite.k6.js -e BASE_URL=http://localhost:1337
```

## Staging handoff for humans

1. Deploy this branch to staging with production-like Postgres and Redis.
2. Seed non-production users for login, dashboard, admin, org, and support-chat flows.
3. Run the Phase 1 verification checklist against staging.
4. Attach coverage, Playwright, k6, Semgrep, Trivy, and integration-matrix artifacts to the PR.
5. Confirm whether the strict p95 <100ms load gate is ready to block merges or should run as a staging-only required check while performance work lands in Phase 2.

## Next phase entry criteria

- CI can install dependencies without registry 403 failures.
- Integration matrix shows zero frontend calls without a backend route.
- Human leads confirm staging URL/secrets and approve strict load-test enforcement scope.
