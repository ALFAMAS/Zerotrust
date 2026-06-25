# Phase 3 — shadcn/ui Refactor and Integration Completion

Date: 2026-06-25  
Goal: continue replacing bespoke UI controls with shadcn primitives while proving frontend calls use mounted backend contracts.

## Implemented in this phase

| Workstream | Deliverable | Acceptance signal |
|---|---|---|
| CI reliability | Fixed CI Postgres URLs to use the actual service password and added `db:push` before backend, E2E, and load-test jobs. | CI jobs can boot against a real schema instead of failing on auth/schema setup. |
| shadcn adoption | Migrated the native support chat fallback from raw `button`/`input`/panel markup to shadcn `Button`, `Input`, and `Card` primitives. | The support chat uses shared variants, focus styles, and theme tokens. |
| Integration coverage | Added a Playwright smoke test that mocks dashboard dependencies, sends a native support-chat message, and asserts the request hits `POST /support` with the backend schema. | Prevents regression back to unmounted `/support/tickets` calls. |

## Remaining Phase 3 backlog

- Convert the remaining raw buttons and inputs across dashboard/admin pages to shadcn primitives.
- Add visual-regression baselines for landing, login/register, dashboard, admin, and support-chat states.
- Add an aXe-based accessibility test dependency when registry access is available.
- Regenerate the TypeScript SDK after any OpenAPI route-shape changes and enforce SDK usage for new frontend API calls.

## Staging validation

```bash
bun run --cwd packages/ui test:e2e -- dashboard-polish.spec.ts
bun run audit:integration
git diff --exit-code -- docs/api-ui-integration-matrix.md
```

Attach Playwright traces/screenshots for the support-chat test to the PR if the CI job fails.
