# zerotrust — TODO

## Security baseline (`docs/security.md`)

Audit date: **2026-07-05**. Verified/completed items moved to [`shipped.md`](./shipped.md) § Security baseline audit.

**Verification (2026-07-08):** Security baseline — SEC-27 + DQ-2 remain open. Production checklist audit (2026-07-07) added **18** tracked gaps in § Production readiness below (**18** open items total; CI-2 + DOC-1 shipped 2026-07-08).

### Low / Ops (document + deploy)

- [ ] **SEC-27** — **P1** — VPS firewall / private Postgres+Redis binding (§9)

       **Problem:** Codebase documents Coolify/VPS deploy but ufw/default-deny and private DB interfaces are operator runbook items, not verified in repo automation.

       **Fix:** Add/check deploy checklist in `docs/deployment.md` with ufw + bind-address steps; optional CI doc lint.

       **Paths:** `docs/deployment.md`, `docs/reference-architecture.md`

       **Refs:** §9 Ops · [`production-checklist.md`](../production-checklist.md) § Security

- [ ] **DQ-2** — **P1** — Test coverage below stated 85% target

       **Problem:** API coverage ~64.6% lines / ~55.5% branches; UI ~54.6% lines vs 85% long-term aspiration in `docs/maintenance-scorecard.md`.

       **Fix:** Continue incremental ratchet in `vitest.config.ts` / `packages/ui/vitest.config.ts`; raise floors over time.

       **Paths:** `vitest.config.ts`, `packages/ui/vitest.config.ts`, `docs/maintenance-scorecard.md`, `.github/workflows/ci.yml`

       **Status (2026-07-05):** Floors aligned to measured baseline (API 64/61/55/63; UI 54/52/46/51). Long-term 85% target — incremental ratchet ongoing.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Testing

---

## Production readiness (`docs/production-checklist.md`)

Audit date: **2026-07-07**. Open gaps from [`production-checklist.md`](../production-checklist.md) rows marked **Partial**, **Missing**, or **Unknown** (Done rows omitted).

### Security

- [ ] **OPS-1** — **P0** — `/metrics` auth verified at deploy

       **Problem:** Production fail-fast requires `METRICS_AUTH_TOKEN` (SEC-21), but scrape endpoint protection depends on operator setting the token before go-live.

       **Fix:** Confirm token set in production env; document in deploy sign-off; verify Prometheus scrape uses `Authorization: Bearer`.

       **Paths:** `docs/deployment.md`, `monitoring/prometheus.yml`, `.env.example`

       **Status:** Partial — code enforces; operator action required.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Security

- [ ] **AUTH-1** — **P2** — Apple Sign In

       **Problem:** Env placeholders exist in `.env.example` but no Apple OAuth provider is implemented.

       **Fix:** Add `plugins/oauth/providers/apple.ts` and wire provider toggle in admin auth settings.

       **Paths:** `plugins/oauth/`, `.env.example`, `packages/ui/src/app/admin/auth-settings/`

       **Status:** Missing.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Security

- [ ] **CRYPTO-1** — **P2** — Hardware key store (TPM/HSM)

       **Problem:** Only software CSFLE/key-store stubs exist; no TPM, Secure Enclave, or PKCS#11 integration.

       **Fix:** Implement or document fork path in `src/crypto/hardware-key-store.ts`; clarify README scope (P5.3 partial).

       **Paths:** `src/crypto/hardware-key-store.ts`, `README.md`

       **Status:** Partial — stubs only.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Security

### Infrastructure / Deploy

- [ ] **INF-1** — **P1** — UI container image

       **Problem:** No `packages/ui/Dockerfile`; `docker-compose.yml` has no UI service — container deploy story is API-only.

       **Fix:** Add `packages/ui/Dockerfile` (or root `Dockerfile.ui`), compose service, and document in `docs/deployment.md` + `docs/reference-architecture.md`.

       **Paths:** `packages/ui/`, `docker-compose.yml`, `docs/deployment.md`

       **Status:** Missing.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Infrastructure / Deploy

- [ ] **INF-2** — **P1** — Staging deploy workflow secrets

       **Problem:** `.github/workflows/deploy-staging.yml` is a template until repository secrets and host targets are wired.

       **Fix:** Configure staging secrets; run `staging-validation.yml` after each staging deploy.

       **Paths:** `.github/workflows/deploy-staging.yml`, `.github/workflows/staging-validation.yml`

       **Status:** Partial.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Infrastructure / Deploy

- [ ] **INF-3** — **P2** — Production auto-deploy

       **Problem:** No automated production deploy workflow; operators use manual PM2 + nginx per README.

       **Fix:** Add production deploy workflow or document intentional manual-only policy in `docs/deployment.md`.

       **Paths:** `.github/workflows/`, `README.md`, `docs/deployment.md`

       **Status:** Missing.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Infrastructure / Deploy

- [ ] **OPS-2** — **P0** — `NEXT_PUBLIC_ZEROTRUST_URL` points to prod API

       **Problem:** UI must target the public HTTPS API; misconfiguration breaks auth and API calls in production.

       **Fix:** Set `packages/ui/.env.local` (or build-time env) to production API URL; verify in pre-launch sign-off.

       **Paths:** `packages/ui/.env.example`, `packages/ui/src/lib/apiClient.ts`

       **Status:** Partial — operator must set at deploy.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Frontend

### Observability

- [ ] **OBS-1** — **P1** — Production alerting wiring

       **Problem:** Prometheus + Alertmanager configs exist locally, but PagerDuty/Slack (or equivalent) routing is environment-specific and unverified in repo.

       **Fix:** Connect Alertmanager receivers to on-call; archive wiring evidence in `docs/compliance/evidence/`.

       **Paths:** `monitoring/alerts.yml`, `docker-compose.observability.yml`, `docs/compliance/monitoring-evidence-procedure.md`

       **Status:** Unknown — verify per environment.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Observability

### Testing

- [ ] **PERF-1** — **P1** — k6 load tests + p95 thresholds in CI

       **Problem:** `tests/load/` exists and staging-validation enforces thresholds, but CI load job may use `continue-on-error` — regressions can slip through.

       **Fix:** Review k6 job in `.github/workflows/ci.yml`; gate on staging or make blocking with agreed SLO floors.

       **Paths:** `tests/load/`, `.github/workflows/ci.yml`, `.github/workflows/staging-validation.yml`

       **Status:** Partial.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Testing · § Performance

- [ ] **PERF-2** — **P1** — Lighthouse >90 gate

       **Problem:** Lighthouse thresholds enforced only via manual `staging-validation.yml`, not on every PR.

       **Fix:** Run Lighthouse in staging pipeline after deploy; archive artifacts as compliance evidence.

       **Paths:** `.lighthouserc.json`, `.github/workflows/staging-validation.yml`

       **Status:** Partial.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Performance

### CI/CD

- [ ] **CI-1** — **P2** — semantic-release CI workflow

       **Problem:** `.releaserc.json` and `bun run release` exist locally but no `.github/workflows/release.yml` automates releases on `main`.

       **Fix:** Add release workflow; document in `docs/deployment.md`.

       **Paths:** `.releaserc.json`, `.github/workflows/`

       **Status:** Partial.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § CI/CD

- [ ] **DX-1** — **P2** — Husky pre-commit Biome

       **Problem:** Biome format/lint step is commented out in `.husky/pre-commit` — drift reaches CI instead of failing locally.

       **Fix:** Uncomment Biome hook; align with `lint:ci` rules.

       **Paths:** `.husky/pre-commit`, `biome.json`

       **Status:** Partial.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § CI/CD · § Developer Experience

- [ ] **DX-2** — **P2** — Commitlint in Husky

       **Problem:** Conventional-commit enforcement is commented out in `.husky/commit-msg`.

       **Fix:** Uncomment commitlint hook; ensure `commitlint.config.js` matches semantic-release expectations.

       **Paths:** `.husky/commit-msg`, `commitlint.config.js`

       **Status:** Partial.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § CI/CD · § Developer Experience

### Data / DB

- [ ] **DB-1** — **P1** — Repository layer for hot-path writes

       **Problem:** Ten repositories exist in `src/db/repositories/` but many routes still use inline Drizzle for multi-statement / idempotent writes.

       **Fix:** Extract hot paths (refresh rotation, wallet, passkeys, etc.) behind repository methods per `CLAUDE.md` canonical modules guidance.

       **Paths:** `src/db/repositories/`, `src/api/routes/`, `CLAUDE.md`

       **Status:** Partial.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Data / DB

### Frontend

- [ ] **FE-1** — **P2** — shadcn redesign completion

       **Problem:** UI redesign to shadcn components is in progress; not all dashboard/admin surfaces migrated.

       **Fix:** Continue migration per frontend-design skill; track page-level completion in PRs.

       **Paths:** `packages/ui/src/components/ui/`, `packages/ui/src/app/`

       **Status:** Partial.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Frontend

### Developer Experience

- [ ] **DX-3** — **P2** — graphify knowledge graph optional automation

       **Problem:** `/graphify . --update` is a manual pre-ship step; `graphify-out/` is gitignored and not wired into CI.

       **Fix:** Document as required ship step (current policy) or add optional CI artifact generation.

       **Paths:** `graphify-out/`, `CLAUDE.md`, `README.md` § Contributing

       **Status:** Partial — optional manual step today.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Developer Experience

## Backlog (unprioritized)

_(empty — see [`shipped.md`](./shipped.md) § Recent work 2026-07-06)_
