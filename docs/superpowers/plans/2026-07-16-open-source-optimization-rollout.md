# Open-source optimization rollout implementation plan

**Design:** [`../specs/2026-07-16-open-source-optimization-rollout-design.md`](../specs/2026-07-16-open-source-optimization-rollout-design.md)

## Working rules

- Follow red-green-refactor for every behavior or contract change.
- Preserve the root layout as a Server Component and keep diagnostic tooling out
  of production client bundles.
- Reuse cookie consent and the existing analytics integration; do not add an
  unauthenticated telemetry API.
- Keep PgBouncer, PgHero, profiling, and image analysis opt-in.
- Use literal executable/argv process launches with `shell: false`.
- Commit each independently verified stage before beginning the next stage.

## Task 1: bundle-analysis and budget contract

**Files**

- Add `src/__tests__/ui-performance-tooling.test.ts`.
- Update `packages/ui/package.json` and `bun.lock`.
- Add `packages/ui/.size-limit.json`.
- Update `.gitignore`.
- Update `.github/workflows/ci.yml`.

**Red**

1. Add repository contract tests asserting:
   - `analyze` invokes `next experimental-analyze`;
   - `analyze:output` adds `--output`;
   - `size` invokes `size-limit` without rebuilding;
   - `size:build` performs a production build before the budget check;
   - `size-limit` and `@size-limit/file` are development dependencies;
   - JavaScript and CSS have separate Brotli budgets;
   - `.next/diagnostics/analyze` output is ignored;
   - the existing `build-ui` CI job runs the budget immediately after build.
2. Run `bunx vitest run src/__tests__/ui-performance-tooling.test.ts` and confirm
   failures are caused by the absent tooling.

**Green**

1. Add the scripts and dependencies.
2. Add the Size Limit configuration using `.next/static/chunks/**/*.js` and
   `.next/static/css/**/*.css`.
3. Add the ignore rule and CI step.
4. Run the focused test until green.

**Baseline and failure proof**

1. Run a clean production UI build.
2. Run Size Limit without limits to record Brotli JavaScript and CSS totals.
3. Apply the design formula: observed value × 1.10, rounded upward to 10 kB.
4. Run the configured budgets successfully.
5. Copy the config to a temporary ignored location, lower one limit beneath the
   observed value, and prove `size-limit --config <temporary-config>` exits
   non-zero.
6. Run `next experimental-analyze --output` and verify the static report exists
   under the ignored diagnostics directory.

## Task 2: development render diagnostics

**Files**

- Add `packages/ui/scripts/react-scan-assets.mjs`.
- Update `packages/ui/src/app/layout.tsx`.
- Extend `src/__tests__/ui-performance-tooling.test.ts`.
- Update `packages/ui/.env.example`, `packages/ui/package.json`, and `bun.lock`.

**Red**

1. Add contract tests proving the scanner:
   - is copied to an ignored self-hosted path for development;
   - removes its external version-check request during the copy;
   - loads before React only when development mode and the explicit public flag
     are enabled;
   - is removed before production builds.
2. Run the focused tests and observe the missing dependency, asset lifecycle,
   and layout failures.

**Green**

1. Add `react-scan` as a development dependency.
2. Implement a fail-closed asset copy/clean script. Copy the browser bundle for
   `next dev`, removing the external version-check block by a verified signature,
   and clean it before production builds.
3. Load the self-hosted asset with `next/script` and `beforeInteractive` without
   adding `"use client"` to the root layout.
4. Document `NEXT_PUBLIC_REACT_SCAN=false`.
5. Run focused tests, type checking, and a production build.
6. Use a real browser to prove the React Scan hook and toolbar initialize before
   React without application console errors.
7. Inspect production chunks and analyzer output to prove React Scan is absent.

**Manual baseline**

Record render observations for admin-user sorting/filtering, command-palette
navigation, admin-chart hover/scrub, and shell/sidebar interactions in
`docs/superpowers/reports/2026-07-16-react-render-baseline.md`.

## Task 3: React Compiler pilot

**Files**

- Extend `src/__tests__/ui-performance-tooling.test.ts`.
- Update `packages/ui/next.config.ts`, `packages/ui/package.json`, and `bun.lock`.

**Red**

1. Add contract tests requiring `babel-plugin-react-compiler` and
   `reactCompiler: true`.
2. Run the focused test and observe the missing compiler configuration.

**Green**

1. Add the compiler development dependency and enable the stable Next.js option.
2. Run focused tests, UI tests, UI type checking, and a production build.
3. Re-run Size Limit and compare analyzer artifacts to the Stage 1 baseline.
4. Exercise the four render-baseline interactions in a browser with React Scan.
5. Add `"use no memo"` only where a reproducible failure proves it necessary.

## Task 4: consent-gated field Web Vitals

**Files**

- Add `packages/ui/src/lib/webVitals.ts` and
  `packages/ui/src/lib/webVitals.test.ts`.
- Add `packages/ui/src/components/WebVitalsReporter.tsx` and
  `packages/ui/src/components/WebVitalsReporter.test.tsx`.
- Update `packages/ui/src/components/AnalyticsScript.tsx` and its tests.
- Update `packages/ui/src/app/layout.tsx`.

**Red**

1. Define tests for a minimal event payload containing only `name`, `value`,
   `delta`, `rating`, `id`, and `navigationType`.
2. Prove metrics are discarded when consent is absent or denied.
3. Prove accepted metrics dispatch one internal event without entries, URLs,
   route data, selectors, or tenant/user data.
4. Extend analytics tests to prove:
   - GA receives the structured metric through `dataLayer.push`;
   - initialized PostHog receives the metric;
   - absent providers are no-ops;
   - handler failures do not escape into React.
5. Run focused tests and confirm the missing reporter/event behavior fails.

**Green**

1. Implement the typed event normalizer and reporter leaf using
   `useReportWebVitals`.
2. Keep the callback stable at module scope.
3. Subscribe from the already consent-gated analytics component and route the
   minimal payload to configured providers.
4. Mount the reporter as a client leaf.
5. Run focused tests, the UI suite, a production build, and browser verification
   with accepted and denied consent.

## Task 5: optional PgBouncer and PgHero operator profile

**Files**

- Add `docker-compose.performance.yml`.
- Add `infra/pgbouncer/pgbouncer.ini` and a secure user-list bootstrap path.
- Add `scripts/ops/setup-pghero-readonly-role.sql`.
- Add `src/__tests__/performance-compose.test.ts`.
- Extend `vitest.integration.config.ts` and integration fixtures only as needed.
- Update `.env.example`, `docs/infra/README.md`, and `docs/deployment.md`.

**Red**

1. Add static contract tests proving:
   - both services are opt-in profiles;
   - PgBouncer uses transaction mode, health checks, bounded pools, and no
     committed password;
   - PgHero binds to loopback, uses a dedicated URL, and never receives the owner
     URL by default;
   - the default compose stack has no dependency on either service.
2. Add an integration scenario that repeatedly establishes transaction-pooled
   connections and verifies transaction-scoped tenant context is cleared.
3. Observe the static tests fail because the profile is absent.

**Green**

1. Add pinned images and optional profiles.
2. Supply credentials through environment/secrets and bootstrap a read-only
   diagnostics role.
3. Document direct/admin database URLs for migrations and pooled URLs for the
   application.
4. Run compose config validation and static tests.
5. Start Postgres and PgBouncer locally, then run the tenant-isolation,
   prepared-query, transaction, auth, org, billing, job, and audit integration
   checks required by the design.
6. Start PgHero with the read-only role and confirm it is reachable only through
   the loopback binding.

If the local engine cannot run containers, leave the profile implemented but do
not declare transaction pooling supported until the integration evidence exists.

## Task 6: Bun and Speedscope profiling workflow

**Files**

- Add `src/__tests__/profiling-tooling.test.ts`.
- Update `package.json`, `bun.lock`, and `.gitignore`.
- Update `docs/infra/README.md`.

**Red**

1. Add contract tests requiring CPU-profile, Markdown CPU-profile, heap-profile,
   and Speedscope viewer commands plus an ignored `profiles/` directory.
2. Prove commands use fixed executable/argv values and do not interpolate request
   or user input.
3. Run the focused test and observe missing scripts.

**Green**

1. Add the profiling/viewer scripts and Speedscope development dependency.
2. Build the API, collect a short local CPU profile, and open/validate its format.
3. Document representative profiling workflows without enabling them in normal
   production startup.

## Task 7: Docker image efficiency and production pruning

**Files**

- Extend `src/__tests__/dockerfile.workspaces.test.ts`.
- Update `Dockerfile` and `.github/workflows/ci.yml` or the existing image
  workflow.
- Add a pinned Dive configuration or CI invocation.
- Update `docs/deployment.md`.

**Red**

1. Add tests requiring a production-dependency stage and prohibiting runtime
   copies of the builder's full `node_modules`.
2. Require both Bun and Node runtime stages to copy the pruned production tree and
   preserve workspace links.
3. Require a pinned Dive efficiency check and a recorded baseline.
4. Run the focused tests and observe failures against the current Dockerfile.

**Green**

1. Record current Bun and Node image sizes and Dive efficiency.
2. Add a frozen production install stage with all workspace manifests and the
   postinstall inputs it genuinely needs.
3. Copy only production dependencies and required workspace sources into runtime
   targets.
4. Build both targets, run each as a non-root user, and verify `/health`.
5. Exercise configured optional providers and dynamic imports.
6. Run Dive against both images and set a checked-in efficiency threshold that is
   no looser than the measured post-pruning result.

## Task 8: documentation and completion audit

**Files**

- Update `README.md`, `docs/project/shipped.md`, `docs/infra/README.md`, and
  `docs/deployment.md`.
- Add final measurement reports under `docs/superpowers/reports/`.

**Verification**

1. Run focused tests after every task.
2. Run API and UI Vitest suites, integration containers, Playwright, and
   Lighthouse.
3. Run root/UI type checks, Biome CI, Knip, module boundaries, generated-file
   verification, production builds, and bundle budgets.
4. Inspect browser console, hydration, consent behavior, and production chunks.
5. Validate both default and performance compose configurations.
6. Build and smoke-test Bun and Node API images.
7. Scan the complete diff against the mandatory CWE rules.
8. Confirm every success criterion in the design has direct evidence before
   marking the goal complete.
