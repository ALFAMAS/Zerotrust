## Testing in `zerotrust`

This repo has **four** test surfaces. They intentionally differ in runtime, dependencies, and what they validate.

### 1) API tests (Vitest)

- **What**: Backend unit + integration tests for Hono routes, middleware, services, and repositories.
- **Where**: `src/__tests__/`
- **Local command**: `bun run test`
- **CI**: `.github/workflows/ci.yml` job **Tests** (`test`)

### 2) UI component tests (happy-dom + Testing Library)

- **What**: Component and client-side logic tests for the Next.js UI using a DOM shim (no real browser).
- **Where**: `packages/ui/src/**/*.test.tsx`
- **Local command**: `bun run --cwd packages/ui test`
- **CI**: `.github/workflows/ci.yml` job **Tests** (`test`) step “UI component tests (happy-dom + Testing Library)”
- **Coverage gate**: `bun run test:coverage:ui` (gated surface configured in `packages/ui/vitest.config.ts`)

### 3) UI end-to-end tests (Playwright)

- **What**: Full-stack flows against a started API + UI with a real browser (smoke + a11y checks).
- **Where**: `packages/ui/e2e/`
- **Local command**: `bun run --cwd packages/ui test:e2e`
- **CI**: `.github/workflows/ci.yml` job **Playwright E2E & Accessibility Smoke** (`e2e-ui`)

### 4) Load & chaos tests (k6)

- **What**: Load/perf and fault-injection scenarios (SLO-style thresholds in CI).
- **Where**: `tests/load/*.k6.js`
- **Local commands**:
  - `bun run load:login`
  - `bun run load:auth-cache`
- **CI**: `.github/workflows/ci.yml` job **Load & Chaos Tests** (`load-test`)

---

### Database note (CI vs local)

CI provisions Postgres + Redis service containers and applies schema using `bun run db:migrate`. For local runs, set `DATABASE_URL` and ensure Postgres is running before running any tests that touch the DB.

