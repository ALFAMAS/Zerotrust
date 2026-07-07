# Production checklist

**Audience:** Operators, platform engineers, and compliance leads deploying zerotrust for real users.

**What this is:** An actionable, repo-specific production-readiness checklist derived from the
2026-07-07 production audit. It complements the env-var summary in
[`README.md`](../README.md#production-checklist) and the CI/CD map in
[`deployment.md`](./deployment.md) with categorized sign-off items, current status, and
file-structure guidance.

**How to use:** Work top-to-bottom before first production traffic. Mark each row Done/Partial/Missing
in your deploy runbook or SOC 2 evidence folder. Open backlog items live in
[`project/todo.md`](./project/todo.md); shipped capabilities in [`project/shipped.md`](./project/shipped.md).

**Legend:** **P0** = ship blocker · **P1** = fix before scale · **P2** = improvement

| Status | Meaning |
| ------ | ------- |
| **Done** | Implemented and verified in repo or CI |
| **Partial** | Exists but operator action or incremental work remains |
| **Missing** | Not implemented |
| **Unknown** | Depends on your environment; verify at deploy time |

---

## Pre-launch sign-off

Complete before pointing DNS at production. Archive signed copies in
[`compliance/evidence/`](./compliance/evidence/README.md).

| # | Gate | Owner | Date | Sign-off |
| - | ---- | ----- | ---- | -------- |
| 1 | All **P0** rows below marked Done or explicitly accepted risk | | | ☐ |
| 2 | Production env vars set per [`.env.example`](../.env.example) + README | | | ☐ |
| 3 | `bun run bootstrap:admin` run once on fresh DB (or admin promoted) | | | ☐ |
| 4 | TLS termination + separate API/UI vhosts configured | | | ☐ |
| 5 | `WORKER_MODE=true` on API replicas; exactly one `src/worker.ts` process | | | ☐ |
| 6 | Encrypted backups tested (`bun run db:backup` + restore drill) | | | ☐ |
| 7 | `staging-validation.yml` smoke + Lighthouse + ZAP run on staging | | | ☐ |
| 8 | Security baseline reviewed ([`security.md`](./security.md)); VPS hardening runbook applied or managed DB/Redis confirmed | | | ☐ |
| 9 | Incident response + backup runbooks acknowledged by on-call | | | ☐ |
| 10 | `METRICS_AUTH_TOKEN`, `CORS_ALLOWED_ORIGINS`, WebAuthn RP ID/origins verified | | | ☐ |
| 11 | `/metrics` curl + `ops:smoke` bearer auth verified (OPS-1) | | | ☐ |

---

## Security

| ☐ | Item | Priority | Status | Notes |
| - | ---- | -------- | ------ | ----- |
| ☐ | CWE hardening (601, 918, 78, 22, 532, 1333, 327, 1427, 79) | P0 | **Done** | Canonical modules: `src/shared/safeRedirect.ts`, `safeFetch.ts`, `cryptoHash.ts`; `src/middleware/inputSanitization.ts`; enforced in `CLAUDE.md` / `AGENTS.md` |
| ☐ | Production fail-fast secrets | P0 | **Done** | `TOKEN_SECRET_HEX`, `CSFLE_MASTER_KEY_HEX`, `REDIS_URI` — `src/__tests__/config.production.test.ts` |
| ☐ | Tenant isolation + Postgres RLS | P0 | **Done** | `src/middleware/orgRls.ts`; migrations `drizzle/0035_org_rls_policies.sql`, `0038_org_rls_expansion.sql`; CI `org-scoping:check` |
| ☐ | CSRF, CORS allowlist, body limits, input sanitization | P0 | **Done** | Global stack in `src/api/server.ts` |
| ☐ | `/metrics` auth in production | P0 | **Done** | OPS-1 (2026-07-08): deploy sign-off + `ops:smoke` bearer verify; `monitoring/prometheus.yml` Bearer scrape |
| ☐ | SAST + secret scan in CI | P0 | **Done** | Gitleaks, Semgrep OWASP, Trivy, `bun audit` — `.github/workflows/ci.yml` |
| ☐ | VPS firewall / private Postgres+Redis | P1 | **Done** | SEC-27 (2026-07-08): `docs/deployment.md` § VPS network hardening — ufw/SG, bind-address, verification |
| ☐ | PASETO v4 + refresh rotation + argon2id passwords | P0 | **Done** | `src/crypto/paseto-v4.ts`, `src/shared/passwordHash.ts` |
| ☐ | Tamper-evident audit log | P1 | **Done** | `src/audit/`, `scripts/audit-anchor.ts` |
| ☐ | Apple Sign In | P2 | **Missing** | Env placeholders in `.env.example`; no `plugins/oauth/providers/apple.ts` |
| ☐ | Hardware key store (TPM/HSM) | P2 | **Partial** | Stubs in `src/crypto/hardware-key-store.ts` |
| ☐ | `SECURITY.md` accuracy (argon2id vs bcrypt) | P2 | **Done** | DOC-1 (2026-07-08): argon2id + bcrypt rehash wording in root `SECURITY.md` |

---

## Infrastructure / Deploy

| ☐ | Item | Priority | Status | Notes |
| - | ---- | -------- | ------ | ----- |
| ☐ | `.env.example` + `packages/ui/.env.example` | P0 | **Done** | Inline documentation for all vars |
| ☐ | API `Dockerfile` (multi-stage Bun/Node) | P0 | **Done** | Root `Dockerfile`; CI docker-smoke job |
| ☐ | `docker-compose.yml` (API + worker + PG + Redis) | P0 | **Done** | `WORKER_MODE=true` on API service |
| ☐ | **UI container image** | P1 | **Missing** | No `packages/ui/Dockerfile`; compose has no UI service |
| ☐ | Reference architectures (VM, containers, K8s) | P1 | **Done** | `docs/reference-architecture.md` |
| ☐ | Staging deploy workflow | P1 | **Partial** | `.github/workflows/deploy-staging.yml` — template until secrets wired |
| ☐ | Production auto-deploy | P2 | **Missing** | Manual PM2 + nginx per README § Production deployment |
| ☐ | Postgres role separation (app vs migrator) | P1 | **Done** | `scripts/setup-postgres-roles.sql`, `.env.example` |
| ☐ | Encrypted backups + S3 | P0 | **Done** | `scripts/db-backup.js`, `src/services/dbBackup.service.ts` |
| ☐ | DR restore drill automation | P1 | **Done** | `.github/workflows/dr-restore-drill.yml` (weekly + manual) |
| ☐ | Background worker topology | P0 | **Done** | API `WORKER_MODE=true`; one `src/worker.ts` — `docs/deployment.md` |

---

## Observability

| ☐ | Item | Priority | Status | Notes |
| - | ---- | -------- | ------ | ----- |
| ☐ | Prometheus `/metrics` | P0 | **Done** | `src/metrics/`, `monitoring/prometheus.yml` |
| ☐ | OpenTelemetry tracing | P1 | **Done** | `src/telemetry/`, `docker-compose.tracing.yml` |
| ☐ | Sentry (API + UI) | P1 | **Done** | `src/instrument.ts`, `packages/ui/sentry.*.config.ts` |
| ☐ | Structured JSON logs | P1 | **Done** | `LOG_FORMAT=json` in Docker/CI |
| ☐ | SLO burn-rate middleware | P2 | **Done** | `src/services/ops/slo.service.ts` |
| ☐ | Local Prometheus + Alertmanager | P2 | **Done** | `docker-compose.observability.yml`, `monitoring/alerts.yml` |
| ☐ | Production alerting wiring | P1 | **Unknown** | Config exists; connect PagerDuty/Slack to Alertmanager |
| ☐ | `/healthz` + public status page | P1 | **Done** | `GET /status`; wire uptime checks in your LB |

---

## Testing

| ☐ | Item | Priority | Status | Notes |
| - | ---- | -------- | ------ | ----- |
| ☐ | Vitest API suite (~1,086 tests) | P0 | **Done** | `src/__tests__/`, root `vitest.config.ts` |
| ☐ | UI component tests (happy-dom) | P0 | **Done** | `packages/ui/vitest.config.ts` |
| ☐ | Playwright E2E (full stack) | P0 | **Done** | `packages/ui/e2e/`; CI `e2e-ui` job |
| ☐ | Coverage ratchet gates (**DQ-2**) | P1 | **Partial** | API ~67% lines / UI ~55% vs 85% aspiration — `vitest.config.ts`, `packages/ui/vitest.config.ts` |
| ☐ | k6 load + chaos | P1 | **Partial** | `tests/load/`; CI load job may use `continue-on-error` |
| ☐ | Staging Lighthouse + OWASP ZAP | P1 | **Done** | `staging-validation.yml` (manual dispatch) |
| ☐ | Destructive migration gate | P1 | **Done** | `migrations:check` in CI; `.destructive-migrations.json` |

---

## CI/CD

| ☐ | Item | Priority | Status | Notes |
| - | ---- | -------- | ------ | ----- |
| ☐ | PR/push CI on `main` | P0 | **Done** | `.github/workflows/ci.yml` — lint, test, build, SAST, Docker smoke |
| ☐ | SDK + API docs drift check | P0 | **Done** | `bun run verify:generated`, `sdk:check` |
| ☐ | API/UI integration matrix | P1 | **Done** | `scripts/audit-api-ui-map.mjs`, `docs/api-ui-integration-matrix.md` |
| ☐ | Dependabot + weekly dependency workflow | P1 | **Done** | `.github/dependabot.yml`, `dependency-update.yml` |
| ☐ | semantic-release automation | P2 | **Partial** | `.releaserc.json` + `bun run release`; no `.github/workflows/release.yml` |
| ☐ | Module boundaries gate in CI | P2 | **Done** | `boundaries:check` in `ci.yml` `lint-and-typecheck` job (CI-2, 2026-07-08) |
| ☐ | Husky pre-commit Biome | P2 | **Partial** | Biome step commented out in `.husky/pre-commit` |
| ☐ | Commitlint | P2 | **Partial** | Commented out in `.husky/commit-msg` |

---

## Data / DB

| ☐ | Item | Priority | Status | Notes |
| - | ---- | -------- | ------ | ----- |
| ☐ | Versioned migrations (41 files) | P0 | **Done** | `drizzle/`; use `bun run db:migrate` in prod |
| ☐ | Schema split by domain | P1 | **Done** | `src/db/schema/*.ts` + legacy `src/db/schema.ts` |
| ☐ | Repository layer for hot paths | P1 | **Partial** | 10 repos in `src/db/repositories/`; many routes still inline Drizzle |
| ☐ | Read replica support | P2 | **Done** | `DATABASE_URL_READ_REPLICA` in `.env.example` |
| ☐ | Audit hash-chain + anchoring | P1 | **Done** | `src/audit/`, `scripts/audit-anchor.ts` |
| ☐ | Data retention / GDPR purge | P1 | **Done** | `src/services/compliance/dataRetention.ts` |
| ☐ | Backup encryption enforced in prod | P0 | **Done** | `BACKUP_REQUIRE_ENCRYPTION=true` fail-fast — `src/services/dbBackup.service.ts` |

---

## API

| ☐ | Item | Priority | Status | Notes |
| - | ---- | -------- | ------ | ----- |
| ☐ | OpenAPI + generated client | P1 | **Done** | `src/api/openapi.json`, `packages/client/` |
| ☐ | API versioning middleware | P2 | **Done** | `src/middleware/apiVersioning.ts` |
| ☐ | Consistent error envelope | P0 | **Done** | `src/shared/httpErrors.ts`, `src/api/errorHandler.ts` |
| ☐ | Pagination canonical module | P1 | **Done** | `src/shared/pagination.ts`, `src/shared/dbCount.ts` |
| ☐ | Feature plugins (oauth, mfa, magic-link) | P1 | **Done** | Root `plugins/`; loader `src/plugins/loader.ts` — see `docs/plugins.md` |
| ☐ | Swagger `/docs` (dev) | P2 | **Done** | Dev-only per README |
| ☐ | Org-scoped authorization | P0 | **Done** | `src/shared/permissions.ts` — `assertCan()`, `authorizeOrg()` |

---

## Frontend

| ☐ | Item | Priority | Status | Notes |
| - | ---- | -------- | ------ | ----- |
| ☐ | Canonical `apiClient` + server-state hooks | P0 | **Done** | `packages/ui/src/lib/apiClient.ts`, `lib/server-state/` |
| ☐ | i18n (EN/ES/FR/AR) | P1 | **Done** | next-intl, `packages/ui/messages/` |
| ☐ | PWA + web push | P2 | **Done** | `packages/ui/public/sw.js` (production builds only) |
| ☐ | Security headers + CSP | P0 | **Done** | `packages/ui/src/config/securityHeaders.ts`, API `securityHeaders.ts` |
| ☐ | No Next.js `middleware.ts` auth boundary | P0 | **Done** | Intentional — `docs/security.md` §0 |
| ☐ | shadcn redesign | P2 | **Partial** | In progress |
| ☐ | SEO on public pages | P2 | **Done** | `app/sitemap.ts`, `app/robots.ts`, `generateMetadata` on marketing routes |
| ☐ | `NEXT_PUBLIC_ZEROTRUST_URL` points to prod API | P0 | **Partial** | Operator must set `packages/ui/.env.local` |

---

## Documentation

| ☐ | Item | Priority | Status | Notes |
| - | ---- | -------- | ------ | ----- |
| ☐ | README production checklist | P0 | **Done** | `README.md` § Production checklist |
| ☐ | This production checklist | P0 | **Done** | `docs/production-checklist.md` |
| ☐ | `docs/deployment.md` CI/CD map | P0 | **Done** | Pipeline diagram + hardening |
| ☐ | `docs/ARCHITECTURE.md` | P1 | **Done** | System deep dive |
| ☐ | `docs/extending.md`, `docs/plugins.md` | P1 | **Done** | Integration guides |
| ☐ | Agent context (`CLAUDE.md`, `AGENTS.md`) | P1 | **Done** | Contributor + agent rules |
| ☐ | Project status docs | P1 | **Done** | `docs/project/todo.md`, `docs/project/shipped.md` |
| ☐ | Quarterly maintenance scorecard | P2 | **Done** | `docs/maintenance-scorecard.md` |

---

## Compliance

| ☐ | Item | Priority | Status | Notes |
| - | ---- | -------- | ------ | ----- |
| ☐ | SOC 2 policies + runbooks | P1 | **Done** | `docs/compliance/` (13+ docs) |
| ☐ | Evidence register + Q3 2026 samples | P1 | **Done** | `docs/compliance/evidence/` |
| ☐ | In-product compliance surfaces | P1 | **Done** | Admin SOC 2 / risk / access reviews |
| ☐ | Backup/restore runbook + drill evidence | P1 | **Done** | `docs/compliance/backup-restore-runbook.md` |
| ☐ | Auditor certification | P2 | **N/A** | Operator process; `docs/compliance/soc2-auditor-readiness.md` |

---

## Performance

| ☐ | Item | Priority | Status | Notes |
| - | ---- | -------- | ------ | ----- |
| ☐ | Rate limiting (Redis + fallback) | P0 | **Done** | `src/middleware/rateLimiting.ts` |
| ☐ | Auth hot-path JOIN + Redis cache | P1 | **Done** | `src/services/auth/sessionCache.service.ts` |
| ☐ | k6 p95 thresholds | P1 | **Partial** | Enforced in staging-validation; CI load tests may be non-blocking |
| ☐ | Lighthouse >90 gate | P1 | **Partial** | Staging workflow only — `.lighthouserc.json` |
| ☐ | Server-side pagination | P1 | **Done** | `src/shared/pagination.ts` on list endpoints |

---

## Developer Experience

| ☐ | Item | Priority | Status | Notes |
| - | ---- | -------- | ------ | ----- |
| ☐ | `bun dev` concurrent API+UI | P0 | **Done** | Root `package.json` |
| ☐ | Biome lint/format | P0 | **Done** | `bun run lint:ci` in CI |
| ☐ | Knip dead-code check | P1 | **Done** | In CI |
| ☐ | Next.js MCP for agents | P2 | **Done** | `.mcp.json`, dev-only at `/_next/mcp` |
| ☐ | graphify knowledge graph | P2 | **Partial** | Optional pre-ship step; `graphify-out/` gitignored |
| ☐ | Generated SDK drift prevention | P1 | **Done** | `bun run verify:generated` |

---

## File structure recommendations

### What works well (keep)

| Area | Path | Why |
| ---- | ---- | --- |
| Monorepo split | `src/` (API), `packages/ui/`, `packages/client/` | Standard Bun workspaces layout |
| Feature plugins | `plugins/{oauth,mfa,magic-link}/` | Enable/disable via env; compiled to `dist/plugins/` |
| Plugin loader | `src/plugins/{loader,discover,registry}.ts` | Resolves dev TS vs prod JS correctly |
| Canonical API utilities | `src/shared/` | Pagination, permissions, safeRedirect, safeFetch |
| Domain services | `src/services/{auth,billing,compliance,notifications,ops}/` | Clear boundaries (~46 services) |
| DB schema domains | `src/db/schema/{identity,organizations,billing,audit,...}.ts` | Easier navigation than one giant file |
| Compliance docs | `docs/compliance/` + `evidence/YYYY/` | Audit-ready evidence structure |
| Ops assets | `monitoring/`, `scripts/db-backup.js`, `tests/load/` | Discoverable for operators |
| UI data layer | `packages/ui/src/lib/server-state/*.ts` | TanStack Query domain modules |
| Boundary rules | `.boundaries.json` | Domain import enforcement |

### What is confusing (address incrementally)

| Issue | Paths | Impact |
| ----- | ----- | ------ |
| Dual plugin locations | Root `plugins/` vs `src/plugins/` (loader only) | Docs must distinguish feature plugins from infrastructure |
| Cross-cutting API folders | `src/jit/`, `src/ssf/`, `src/webhooks/`, `src/notifications/`, `src/mfa/` | Same layer as routes but different roots |
| Legacy schema entry | `src/db/schema.ts` alongside `src/db/schema/` | Two schema surfaces for tooling |
| Scripts sprawl | `scripts/` (~30 files) | Mix of ops, codegen, smoke tests, codemods |
| Tests split three ways | `src/__tests__/`, `packages/ui/src/**/*.test.tsx`, `packages/ui/e2e/`, `tests/load/` | No single test index doc |
| No UI in Docker | `Dockerfile` (API only), `docker-compose.yml` | Full stack locally needs `bun dev:ui` |
| Agent tooling in repo | `.agents/`, `.codex/` | Noise for fork consumers |

### Recommended changes (priority order)

| Action | From → To | Rationale |
| ------ | --------- | --------- |
| ✅ Relocate status docs | `todo.md`, `tdone.md` → `docs/project/` | Cleaner repo root — **done** |
| ✅ Single security doc | `docs/Security.MD` → `docs/security.md` | Avoid case-collision on Windows — **done** |
| ✅ Fix agent docs | `CLAUDE.md` plugin tree | Clarify `plugins/` (features) vs `src/plugins/` (loader) — **done** |
| Add UI Dockerfile | `packages/ui/Dockerfile` + compose service | Parity with API container story |
| Wire boundaries to CI | `boundaries:check` in `ci.yml` | **Done (CI-2, 2026-07-08)** |
| SEC-27 runbook | Add VPS hardening to `docs/deployment.md` | **Done (SEC-27, 2026-07-08)** |
| Group scripts | `scripts/ops/`, `scripts/codegen/`, `scripts/ci/` | Easier onboarding |
| Optional modules folder | `src/jit`, `src/ssf`, `src/webhooks` → `src/modules/` | One mental model for mounted subsystems |

**Do not over-refactor:** Keep `src/shared/` canonical modules, root `plugins/`, and
`packages/ui` server-state layer — they are strengths.

### Incremental target structure

```
zerotrust/
├── plugins/                       # feature plugins (unchanged)
├── src/                           # Hono API (unchanged)
├── packages/
│   ├── client/                    # generated SDK
│   └── ui/                        # Next.js app (+ future Dockerfile)
├── drizzle/
├── docs/
│   ├── compliance/
│   ├── project/                   # todo.md, shipped.md
│   └── production-checklist.md
├── monitoring/
├── scripts/                       # future: ops/, codegen/, ci/ subdirs
├── tests/load/
├── Dockerfile                     # API
└── docker-compose.yml
```

Long-term optional: `apps/api` + `apps/web` workspace rename, `packages/shared-types`
for API↔UI Zod schemas, `deploy/k8s/` Helm per `docs/reference-architecture.md` Blueprint 3.

---

## Action plan

### Quick wins (days, high ROI)

1. ~~**SEC-27** — Add VPS hardening checklist to `docs/deployment.md` (ufw, bind-address, SSH keys).~~ **Done (SEC-27, 2026-07-08)**
2. **UI Docker image** — `packages/ui/Dockerfile` + compose service; document in `docs/deployment.md`.
3. ~~**CI hardening** — Add `bun run boundaries:check` to `ci.yml`; review k6 `continue-on-error`.~~ **Done (CI-2, 2026-07-08)** — review k6 `continue-on-error` remains.
4. **Husky** — Uncomment Biome pre-commit and commitlint in `.husky/`.
5. ~~**Doc fixes** — Update root `SECURITY.md` argon2id wording.~~ **Done (DOC-1, 2026-07-08)**
6. **Production env** — Walk README checklist; archive sign-off above in compliance evidence.

### Medium effort (1–2 weeks)

7. **Coverage ratchet (DQ-2)** — Raise floors in `vitest.config.ts` / `packages/ui/vitest.config.ts`; target 70% API / 60% UI next milestone.
8. **Repository extraction** — Move hot-path writes behind `src/db/repositories/` per `CLAUDE.md`.
9. **Staging secrets** — Wire `deploy-staging.yml` so staging validation runs on every release candidate.
10. **semantic-release CI** — Add `.github/workflows/release.yml` on `main` merge.
11. **Consolidate cross-cutting modules** — `src/jit`, `src/ssf`, `src/webhooks` under `src/modules/` (re-exports only).

### Larger refactors (fork-dependent)

12. **`apps/api` workspace** — Move `src/` into `apps/api` for symmetry with `apps/web`.
13. **`packages/shared-types`** — Shared Zod schemas for API validation + UI forms.
14. **Apple Sign In** — `plugins/oauth/providers/apple.ts`.
15. **Full RLS expansion** — All org tables + org-scoped repo factory everywhere.
16. **Kubernetes manifests** — `deploy/k8s/` per reference architecture Blueprint 3.

---

## Related documentation

| Doc | Purpose |
| --- | ------- |
| [`deployment.md`](./deployment.md) | CI/CD pipeline, staging validation, worker topology, hardening |
| [`security.md`](./security.md) | Structural security baseline (tenant isolation, auth, RLS, CWE tables) |
| [`compliance/`](./compliance/README.md) | SOC 2 policies, runbooks, evidence templates |
| [`reference-architecture.md`](./reference-architecture.md) | VM, container, and Kubernetes deployment blueprints |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System architecture deep dive |
| [`maintenance-scorecard.md`](./maintenance-scorecard.md) | Quarterly metrics (dependencies, CI, coverage, DR) |
| [`project/todo.md`](./project/todo.md) | Open backlog (DQ-2) |
| [`project/shipped.md`](./project/shipped.md) | Shipped feature catalog |
| [`../README.md`](../README.md) | Quick start, env vars, production deployment summary |

---

_Audit date: 2026-07-07. Refresh this checklist when shipping major infra or compliance changes._
