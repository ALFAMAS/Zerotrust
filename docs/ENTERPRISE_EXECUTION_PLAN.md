# Enterprise SaaS Starter Execution Plan

Date: 2026-06-25  
Scope: zerotrust Hono API, Next.js dashboard/admin app, TypeScript SDK, CI/CD, staging validation, and production operations.

## Audit report — prioritized findings

### Validation commands attempted

| Command | Result | Notes |
|---|---:|---|
| `bun run type-check` | Blocked | `node_modules/typescript/lib/tsc.js` is missing because dependencies are not installed. |
| `bun install` | Blocked | The package registry returned HTTP 403 for npm tarballs, so local static analysis and tests cannot complete in this environment. |
| Repository inspection with `rg` / targeted file reads | Completed | Used to map CI, load tests, docs, SDK, API routes, UI routes, and existing operational controls. |

### Critical and high-priority issues

| ID | Severity | Area | Finding | Concrete fix | Owner | Milestone |
|---|---|---|---|---|---|---|
| A-001 | **Critical** | Delivery | Local verification is blocked when dependencies cannot be installed; contributors cannot prove changes before PR. | Add a documented fallback using CI artifacts/cache, pin the Bun version in CI, and keep dependency install failures visible as warnings in PRs until registry access is restored. | Human Lead 1 + AI-1 | Week 1 Day 1 |
| A-002 | **High** | CI/Test Coverage | CI runs unit tests but does not enforce the stated >85% coverage target. Current Vitest thresholds are below the exit criteria. | Raise Vitest global thresholds to 85% and make `bun run test:coverage` a required CI gate with uploaded coverage artifacts. | AI-1 | Week 1 Day 2 |
| A-003 | **High** | Performance | k6 full-suite thresholds permit p95 <1000ms, which does not protect the target API p95 <100ms for auth/org endpoints. | Tighten full-suite thresholds to p95 <100ms and add endpoint-specific auth/org trend thresholds. Run strict thresholds in staging before release. | AI-2 + Human Lead 2 | Week 2 Day 2 |
| A-004 | **High** | Security Testing | CI has dependency audit but no dedicated SAST, container scan, or DAST job. | Add Semgrep SAST, Trivy filesystem/container scanning, and OWASP ZAP baseline against staging or preview deployments. | AI-3 | Week 1 Day 4 |
| A-005 | **High** | E2E/Accessibility | Playwright exists in the UI package, but CI does not execute E2E, aXe accessibility, visual regression, or Lighthouse checks. | Add Playwright CI with browser install, aXe smoke tests, screenshots/traces artifacts, and Lighthouse CI with performance score >=90. | AI-4 | Week 3 Day 2 |
| A-006 | **High** | Frontend/Backend Integration | Backend route inventory is broader than UI coverage; every frontend feature needs an explicit backend route/SDK mapping. | Create and maintain an integration matrix, regenerate the TypeScript SDK on API changes, and add a CI drift check that fails when `src/api/openapi.json` and `packages/client` diverge. | AI-1 + AI-5 | Week 3 Day 3 |
| A-007 | **High** | Operations/DR | Backups and runbooks exist, but CI does not validate restore procedures or produce evidence. | Add scheduled backup/restore validation against ephemeral Postgres and archive evidence paths. | Human Lead 2 + AI-3 | Week 2 Day 5 |
| A-008 | **High** | Observability | Metrics/tracing/logging code exists, but alert and SLO validation are not CI/staging gates. | Add smoke checks for `/metrics`, trace export configuration, structured-log fields, and alert route dry-runs. | AI-2 | Week 2 Day 4 |

### Medium issues to schedule after high-severity closure

| ID | Severity | Area | Finding | Concrete fix |
|---|---|---|---|---|
| A-009 | Medium | Release | CI uses `bun-version: latest`, which can create non-reproducible failures. | Pin to the repository-supported Bun minor and document upgrade cadence. |
| A-010 | Medium | Docs | README is strong, but the four-week execution plan, owners, staging validation commands, and exit metrics need a single source of truth. | Use this document as the execution ledger and update it per PR. |
| A-011 | Medium | Performance | Redis caching, DB indexes, compression, code splitting, and CDN policy need before/after benchmarks. | Create baseline measurements, implement one optimization per PR, and record deltas. |
| A-012 | Medium | UI | shadcn/ui adoption needs automated enforcement, not just audit prose. | Add lint/codemod checks for native form controls/tables where shadcn primitives are required. |

## Phase plans and ownership

### Week 1 — Audit + test suite expansion

| Task | Owner | Output | Acceptance criteria |
|---|---|---|---|
| Publish prioritized audit | AI-1 | `docs/ENTERPRISE_EXECUTION_PLAN.md` | Critical/high findings listed with fixes, owner, milestone. |
| Enforce 85% unit/integration coverage | AI-1 | Vitest threshold + CI coverage job | CI fails below 85%; coverage artifact uploaded. |
| Add SAST/container/DAST plan and jobs | AI-3 | CI workflow jobs | Semgrep and Trivy run on PR; ZAP is configured for staging/preview. |
| Add E2E smoke matrix | AI-4 | Playwright CI job | Login, dashboard, admin smoke tests run with traces on failure. |
| Staging validation handoff | Human Lead 1 | Staging deployment notes | Humans deploy branch and share URL/secrets with agents. |

### Week 2 — Performance + observability

| Task | Owner | Output | Acceptance criteria |
|---|---|---|---|
| Baseline API latency | AI-2 | k6 JSON + summarized benchmark | Auth/org p95 recorded before changes. |
| Redis cache and DB index review | AI-2 | Code + migrations | Cache hit ratio exposed; query plan improves or index is rejected with evidence. |
| Compression/CDN policy | AI-2 + Human Lead 2 | Next/API deployment config | Static assets cacheable; API compression enabled where safe. |
| Observability validation | AI-3 | Metrics/traces/log alerts smoke tests | `/metrics` scrape passes; trace exporter configured; alert dry-run succeeds. |
| DR validation | Human Lead 2 | Restore evidence | Backup restored to clean DB and app smoke test passes. |

### Week 3 — shadcn/ui refactor + integration completion

| Task | Owner | Output | Acceptance criteria |
|---|---|---|---|
| shadcn enforcement | AI-4 | UI checks + component tests | No custom interactive primitive drift; aXe checks pass. |
| Visual regression | AI-4 | Playwright screenshots | Baselines approved for critical pages. |
| API/UI route matrix | AI-5 | Integration matrix doc | Every UI API call maps to backend route and SDK method. |
| Missing endpoints/SDK regeneration | AI-5 | Backend routes + `packages/client` updates | SDK drift check passes; standardized error handling used. |

### Week 4 — final integration, docs, staging sign-off

| Task | Owner | Output | Acceptance criteria |
|---|---|---|---|
| Full staging validation | All AI agents + Human Leads | Staging evidence bundle | Unit, E2E, load, Lighthouse, aXe, SAST/DAST all pass. |
| Docs refresh | AI-1 | README/API/deployment/extension guide updates | Clone-to-ship path is current and copy/pasteable. |
| CI/CD deploy automation | Human Lead 1 + AI-3 | Staging deployment pipeline | Merge to main deploys staging automatically with smoke gates. |
| Exit review | Human Leads | Sign-off issue/PR checklist | All high findings closed; medium items explicitly accepted or scheduled. |

## Staging validation instructions for humans

1. Deploy the PR branch to the staging environment with production-like Postgres and Redis.
2. Set `NEXT_PUBLIC_ZEROTRUST_URL` to the staging API origin and disable destructive email/SMS delivery unless test providers are configured.
3. Provide agents the staging base URLs and non-production seeded credentials.
4. Run and attach these artifacts to the PR:
   - `bun run test:coverage`
   - `bun run --cwd packages/ui test:e2e`
   - `k6 run tests/load/full-suite.k6.js -e BASE_URL=<staging-api>`
   - Lighthouse report for every public/dashboard/admin page in scope
   - SAST/DAST/container scan summaries
5. Validate backup restore into an isolated database and attach restore logs/evidence.

## Running changelog

- 2026-06-25: Created the enterprise execution ledger, captured blocked local validation, identified critical/high gaps, assigned Week 1–4 ownership, and added measurable acceptance criteria.
- 2026-06-25: Raised coverage and load-test targets in configuration so CI/staging can enforce the stated >85% coverage and <100ms API p95 objectives.
- 2026-06-25: Added Phase 1 deliverables, an API/UI integration matrix generator, CI drift checking, and fixed the native live-chat support endpoint mismatch.
- 2026-06-25: Started Phase 2 with API compression, mounted Prometheus metrics, hot-path database indexes, and a reusable operations smoke check for staging health/metrics/version validation.
- 2026-06-25: Started Phase 3 by fixing CI database bootstrap, migrating native support chat to shadcn primitives, and adding a Playwright support-chat API-contract regression.
- 2026-06-25: Added Phase 4 staging sign-off workflow with ops smoke, Lighthouse, OWASP ZAP baseline, and strict k6 validation against human-supplied staging URLs.
- 2026-06-25: Added Phase 5 disaster-recovery workflow that creates encrypted backups, restores them into isolated Postgres, verifies evidence data, and uploads artifacts.
- 2026-06-25: Added Phase 6 SDK drift gate so OpenAPI changes must include regenerated TypeScript client changes before CI can pass.
- 2026-06-25: Added Phase 7 traceability by initializing OpenTelemetry in API startup, mounting request-correlation middleware, and extending ops smoke to require `X-Trace-Id`.
- 2026-06-25: Added Phase 9 alerting with Prometheus scrape config, 5xx/latency/missing-scrape rules, and a local/staging Alertmanager compose overlay.
- 2026-06-25: Added Phase 8 reproducible CI by pinning Bun in `.bun-version` and making all workflows consume that pinned runtime instead of `latest`.
- 2026-06-25: Added Phase 10 shadcn enforcement baseline with a raw-control scanner, committed adoption report, and CI drift check.
- 2026-06-25: Added Phase 11 shadcn migration slice by introducing a shared `Textarea`, migrating feedback/NPS prompts, and reducing the raw-control baseline.
- 2026-06-25: Added Phase 12 shadcn migration slice by migrating LocaleSwitcher, ProductTour, and SetupChecklist controls and reducing the raw-control baseline again.
- 2026-06-25: Added Phase 13 shadcn migration slice by migrating the support dashboard ticket/reply controls and reducing the raw-control baseline to 140 across 34 files.
