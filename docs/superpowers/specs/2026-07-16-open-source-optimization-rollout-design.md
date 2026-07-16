# Open-source optimization rollout design

**Date:** 2026-07-16
**Status:** Approved direction; written specification awaiting review

## Objective

Add a measured, reversible optimization layer to the Next.js UI, Hono/Bun API,
PostgreSQL deployment, and production containers. The rollout must first expose
where time and bytes are spent, then enable optimizations whose effect can be
verified against those measurements.

The implementation uses open-source tools and existing platform capabilities. It
does not add another hosted monitoring vendor or replace the repository's current
Lighthouse, k6, OpenTelemetry, Sentry, Prometheus, or Testcontainers coverage.

## Success criteria

1. Developers can inspect the Turbopack client/server module graph locally and
   export a static analysis artifact.
2. CI fails when the production UI's compressed JavaScript or CSS exceeds a
   checked-in performance budget.
3. React render churn can be inspected in development without adding production
   JavaScript or weakening CSP.
4. React Compiler is enabled only after the measurement layer exists, and the
   production build, browser suite, and bundle budgets remain green.
5. Real-user Core Web Vitals are reported only after analytics consent and contain
   no route parameters, user identifiers, secrets, or free-form page content.
6. Self-hosted operators have an optional, tested PostgreSQL pooling and query
   diagnostics path; managed Postgres users can keep their provider pooler.
7. Bun CPU/heap profiles and Docker image efficiency can be inspected with
   documented, reproducible commands.
8. Runtime behavior remains unchanged when optional optimization flags or
   operator profiles are disabled.

## Current baseline

- Next.js 16.2 uses Turbopack and emits roughly 3.3 MB of JavaScript across all
  production chunks in the latest local build. This is an aggregate artifact
  size, not a claim that a browser downloads every chunk.
- The UI contains 135 client TSX files out of 245 TSX files. Chart, table, motion,
  shell, and provider components are the initial render-profiling targets.
- Lighthouse CI already blocks performance scores below 0.90 on the landing,
  login, and registration routes.
- k6 already covers API load and chaos scenarios; Hono compression is enabled.
- OpenTelemetry, Sentry, Prometheus, and structured logging already cover API
  observability.
- The architecture documentation identifies Postgres connection pooling as the
  scaling ceiling around four to eight workers.
- The root API Dockerfile copies the builder's complete `node_modules` tree into
  both runtime variants, so production dependency pruning has a concrete target.

## Architecture and rollout order

### Stage 1: bundle measurement and budgets

Use Next.js's built-in `next experimental-analyze` command rather than the
Webpack-only analyzer plugin. Add UI scripts for interactive analysis and static
artifact generation.

Use `size-limit` with `@size-limit/file` against the production build's emitted
JavaScript and CSS. The first checked-in limits are calculated from a clean
production build as follows:

- Measure the Brotli-compressed aggregate for JavaScript and CSS separately.
- Multiply each observed value by 1.10.
- Round each ceiling up to the next 10 kB.

The 10% allowance absorbs hashing and compiler noise while still catching a
meaningful dependency or route expansion. Budget changes require an intentional
config diff and an explanation in the pull request. CI runs the budget check
immediately after its existing UI production build, avoiding a duplicate build.

Generated analyzer output remains ignored. CI may upload it as a diagnostic
artifact when a budget fails, but it is not committed.

### Stage 2: render measurement and React Compiler

Add React Scan as a development-only dynamic import behind both
`NODE_ENV === "development"` and `NEXT_PUBLIC_REACT_SCAN === "true"`. The scanner
must not be imported, initialized, or included in production route chunks. It is
mounted as a client leaf; the root layout remains a Server Component.

Record a manual baseline for these representative interactions:

- Sort and filter the admin users table.
- Open and navigate the command palette.
- Hover and scrub an admin analytics time-series chart.
- Toggle the dashboard sidebar and notification panel.

Then install `babel-plugin-react-compiler` and enable Next.js `reactCompiler`.
Global compilation is preferred because the project already uses React 19 and
Next 16, but individual incompatible components may opt out with `"use no memo"`
when a failing test or runtime trace proves the need.

Acceptance requires no new browser errors or hydration warnings, all existing
tests passing, production bundle budgets passing, and no measured interaction
showing higher render counts or worse responsiveness than the recorded baseline.

### Stage 3: consent-gated field Web Vitals

Add a small `WebVitalsReporter` client leaf using Next.js
`useReportWebVitals`. It emits only a typed internal event containing:

- metric name;
- numeric value and delta;
- rating;
- metric ID;
- navigation type.

The reporter checks the canonical cookie-consent state before emitting. It does
not include `location.href`, pathname, query strings, element selectors,
PerformanceEntry URLs, user IDs, organization IDs, or arbitrary attribution
objects.

The existing analytics component consumes the event. GA4 receives a structured
`dataLayer.push` forwarded through Partytown. PostHog receives a capture event
only when its already-consented SDK is initialized. If consent or a provider is
absent, the metric is discarded. No first-party API endpoint or unauthenticated
telemetry ingestion route is added.

### Stage 4: database pooling and query diagnostics

Add PgBouncer as an optional self-hosted compose profile, not as a mandatory
dependency for managed Neon deployments. The application continues to read one
`DATABASE_URL`; operators opt in by pointing it at PgBouncer.

Transaction pooling is the target mode. Before documenting it as supported, the
integration suite must prove:

- migrations bypass the transaction pool or use a session-pooled/admin URL;
- transaction-scoped RLS context does not leak between requests;
- prepared queries and multi-statement transactions still work;
- auth, organization authorization, billing, jobs, and audit writes pass through
  repeated pooled connections.

PgHero is an optional operator profile backed by `pg_stat_statements`. It uses a
dedicated read-only diagnostics role and binds to loopback by default. It is not
mounted in Hono, exposed through the public UI, or given owner credentials.
Managed providers that do not permit the extension may omit PgHero without
affecting application startup.

### Stage 5: API and container profiling

Add documented scripts for Bun CPU and heap profiles. Profile output goes under an
ignored `profiles/` directory and may be opened locally in Chrome, VS Code, or
Speedscope. Profiling is never enabled by default in production.

Use Dive as a CI/local image diagnostic, with a pinned release or image digest.
First establish image size and efficiency baselines. Then introduce a separate
production-dependency stage so runtime images do not inherit development
dependencies from the builder. Do not use automatic slimming: optional native
providers, dynamic imports, and workspace links must remain explicit and tested.

Both Bun and Node runtime targets must still start, answer `/health`, and load all
configured optional providers after pruning.

## Error handling and fallback behavior

- A missing `.next` production build produces a clear Size Limit error directing
  the developer to run the build command.
- Analyzer output is diagnostic only and cannot block normal development.
- React Scan import failures in development are reported once without affecting
  application rendering; no scanner code runs in production.
- Web Vitals reporting is best-effort and never throws into the React tree.
- PgBouncer and PgHero live behind optional compose profiles. Their absence cannot
  make the default local stack unhealthy.
- Profiling and Dive commands fail with actionable installation or missing-image
  messages and do not mutate production configuration.

## Security and privacy constraints

- Analytics consent remains the single gate for Web Vitals delivery.
- No telemetry payload contains URLs, tokens, credentials, request bodies,
  element content, or tenant identifiers (CWE-532).
- The rollout introduces no request-influenced server fetch, redirect, path, shell
  command, regular expression, or database identifier.
- Any process launched by repository scripts uses a literal executable and argv
  with `shell: false`, subject only to the documented Windows package-manager shim
  exception (CWE-78).
- PgHero uses least-privilege credentials, loopback binding, and an operator-only
  deployment profile.
- PgBouncer credentials are supplied through environment/secrets and never
  committed or logged.

## Testing and verification

Tests are written before each implementation stage and observed failing for the
missing behavior.

1. Repository contract tests cover analyzer scripts, Size Limit dependencies and
   config, ignored output, and the CI gate placement.
2. Size Limit is executed against a clean production build and a fixture or
   temporary lowered threshold proves that an over-budget build fails.
3. Component/config tests prove React Scan is development-only and React Compiler
   is enabled.
4. Browser tests cover representative dashboard interactions, hydration, console
   output, and production absence of React Scan.
5. Web Vitals component tests prove consent gating, payload minimization,
   provider routing, and failure isolation.
6. PgBouncer integration tests run repeated transaction-pooled requests and prove
   tenant context isolation before the profile is declared supported.
7. Docker verification builds and smoke-tests both runtime targets and compares
   their sizes to the recorded baseline.
8. Final gates include type checks, Biome, Knip, module boundaries, generated-file
   verification, all Vitest suites, Playwright, Lighthouse, and the production
   Next.js build.

## Explicitly deferred tools

- TanStack Virtual is added only when measurement shows a screen rendering more
  than 200 simultaneous rows or an INP regression attributable to DOM volume.
  Current server-side pagination remains the default optimization.
- Turborepo is deferred until CI timing proves repeated workspace work dominates
  build time.
- Unlighthouse, Autocannon, Million.js, PurgeCSS, generic compression packages,
  and another hosted monitoring platform are excluded because they duplicate or
  conflict with the existing stack.

## Rollback

Each stage is independently reversible. Bundle measurement can remain even if
React Compiler is disabled. React Scan and database dashboards are opt-in. Web
Vitals can be removed without changing provider initialization. PgBouncer can be
bypassed by restoring the direct database URL. Runtime dependency pruning can be
reverted without changing the builder or application artifacts.
