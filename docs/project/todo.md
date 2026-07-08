# zerotrust — TODO

## Security baseline (`docs/security.md`)

Audit date: **2026-07-05**. Verified/completed items moved to [`shipped.md`](./shipped.md) § Security baseline audit.

**Verification (2026-07-09):** OBS-1 shipped (alerting templates + verify script). Production checklist audit (2026-07-07) added **18** tracked gaps in § Production readiness below (**11** open items total; CI-2 + DOC-1 + SEC-27 + OPS-1 + OPS-2 + INF-1 + INF-2 + PERF-1 + PERF-2 + OBS-1 shipped 2026-07-08–09).

### Low / Ops (document + deploy)

---

## Production readiness (`docs/production-checklist.md`)

Audit date: **2026-07-07**. Open gaps from [`production-checklist.md`](../production-checklist.md) rows marked **Partial**, **Missing**, or **Unknown** (Done rows omitted).

### Security

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

- [x] **INF-1** — **P1** — UI container image — **shipped 2026-07-08** → [`shipped.md`](./shipped.md) § Recent work

- [x] **INF-2** — **P1** — Staging deploy workflow secrets — **shipped 2026-07-08** → [`shipped.md`](./shipped.md) § Recent work

- [ ] **INF-3** — **P2** — Production auto-deploy

       **Problem:** No automated production deploy workflow; operators use manual PM2 + nginx per README.

       **Fix:** Add production deploy workflow or document intentional manual-only policy in `docs/deployment.md`.

       **Paths:** `.github/workflows/`, `README.md`, `docs/deployment.md`

       **Status:** Missing.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Infrastructure / Deploy

### Observability

- [x] **OBS-1** — **P1** — Production alerting wiring — **shipped 2026-07-09** → [`shipped.md`](./shipped.md) § Recent work

       **Problem:** Prometheus + Alertmanager configs existed locally, but PagerDuty/Slack routing was environment-specific and unverified in repo.

       **Fix:** Wired Prometheus→Alertmanager in `monitoring/prometheus.yml`; added `monitoring/alertmanager.yml` (local-safe) and `alertmanager.production.example.yml` (PagerDuty + Slack templates); compose mounts config via `ALERTMANAGER_CONFIG`. Added `bun run ops:verify-alerting` and `docs/deployment.md` § OBS-1 sign-off procedure.

       **Paths:** `monitoring/`, `docker-compose.observability.yml`, `scripts/verify-alerting.mjs`, `docs/deployment.md`

       **Status:** Done (operator secrets remain per-environment).

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Observability

### Testing

- [x] **PERF-2** — **P1** — Lighthouse >90 gate — **shipped 2026-07-09** → [`shipped.md`](./shipped.md) § Recent work

       **Problem:** Lighthouse thresholds enforced only via manual `staging-validation.yml`, not on every PR.

       **Fix:** Added a blocking Lighthouse CI job to the main PR/push workflow; staging validation remains the post-deploy evidence run.

       **Paths:** `.github/workflows/ci.yml`, `.lighthouserc.json`, `.github/workflows/staging-validation.yml`

       **Status:** Done.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Performance

- [x] **PERF-1** — **P1** — k6 load tests + p95 thresholds in CI — **shipped 2026-07-08** → [`shipped.md`](./shipped.md) § Recent work

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

       **Status:** Partial — `createAuthenticatedSession()` added to `authSessions.repository.ts` (2026-07-09); login/OAuth/magic-link session minting now transactional. Remaining: admin impersonation session insert, scattered single-statement route writes.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Data / DB

### Frontend

- [ ] **FE-1** — **P2** — shadcn redesign completion

       **Problem:** UI redesign to shadcn components is in progress; not all dashboard/admin surfaces migrated.

       **Fix:** Continue migration per frontend-design skill; track page-level completion in PRs.

       **Paths:** `packages/ui/src/components/ui/`, `packages/ui/src/app/`

       **Status:** Partial.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Frontend


## Backlog (unprioritized)

_(empty — see [`shipped.md`](./shipped.md) § Recent work 2026-07-06)_
