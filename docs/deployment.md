# Deployment & CI/CD

How code gets from a PR to staging/production, and what gates it along the way.
Reference for the **CI/CD & Documentation** deliverable.

- **Manual production deploy** (VM + PM2 + nginx + TLS): see the
  [Production deployment](../README.md#production-deployment) section of the
  README — this guide does not duplicate it.
- **Automated staging deploy:** `.github/workflows/deploy-staging.yml` (below).

---

## Pipeline overview

```
 PR / push ──▶  ci.yml (gating)            manual ──▶ deploy-staging.yml ──▶ staging-validation.yml
               ├─ Lint & Type Check                   (build + ship to host)   (smoke · Lighthouse · ZAP)
               ├─ Tests (+ coverage, SDK,
               │   integration & shadcn audits)        weekly/manual ──▶ dr-restore-drill.yml
               ├─ SAST & Dependency Scans                                 (backup → restore → verify)
               │   (Semgrep · Trivy · bun audit)
               ├─ Build UI
               ├─ Playwright E2E & a11y smoke
               └─ Load & Chaos (k6)
```

### `ci.yml` — runs on every push/PR to `main`

| Job | Gates | Notes |
| --- | --- | --- |
| **Lint & Type Check** | Biome + `bun audit --prod` + `tsc` | dependency audit is blocking (high+) |
| **Tests** | Vitest suite; SDK-drift, API/UI matrix & shadcn report committed-checks | coverage runs **non-blocking** toward the 85% target (currently ~56%) |
| **SAST & Dependency Scans** | Semgrep (`p/owasp-top-ten`) | Trivy step is currently **non-blocking** (its binary install is broken upstream); Semgrep + `bun audit` remain blocking |
| **Build UI** | `next build` | |
| **Playwright E2E & a11y** | full-stack smoke against a started API+UI | needs the app running with Postgres+Redis services |
| **Load & Chaos (k6)** | `tests/load/*.k6.js` | publishes k6 result artifacts; p95 thresholds enforced here |

### `staging-validation.yml` — manual (`workflow_dispatch`)

Validates a **already-deployed** staging environment. Inputs: `staging_url`,
`api_url`. Jobs: **ops-smoke** (`/health`, `/metrics`, `/version`, trace header),
**Lighthouse** (`/`, `/login`, `/register` vs `.lighthouserc.json`), **OWASP ZAP**
baseline DAST. This is where the **p95**, **Lighthouse>90**, and **DAST** exit
criteria are measured — run it after every staging deploy and archive the
artifacts as evidence.

### `dr-restore-drill.yml` — scheduled + manual

Backs up → encrypts → restores into an isolated Postgres → verifies. This is the
recurring evidence for the **DR validated** criterion (see the
[backup/restore runbook](./compliance/backup-restore-runbook.md)).

---

## Production hardening checklist

Endpoint exposure defaults are tuned for local dev; before an internet-facing
deploy, confirm:

- **`METRICS_AUTH_TOKEN` is set** — `/metrics` is **open by default**. Unauthenticated
  it leaks internal route/label cardinality and traffic patterns, so it must be
  token-gated (`Authorization: Bearer <token>`) or kept on a private scrape
  network behind an auth proxy. Generate with `openssl rand -hex 32`.
- **`CORS_ALLOWED_ORIGINS` is set** — an empty allowlist fails closed in
  production (no cross-origin access), so set it to your app/admin origins.
- **Backups are encrypted** — set `BACKUP_ENCRYPTION_KEY_HEX` and
  `BACKUP_REQUIRE_ENCRYPTION=true` so a plaintext dump is never written.

---

## Release & migration safety

The deploy path must survive a bad release without data loss. Three disciplines:

### 1. Destructive migrations are one-way — use expand/contract

Migrations `0020`–`0024` are `DROP TABLE … CASCADE` / `DROP COLUMN` (the
2026-06-28 slim-down). **These cannot be rolled back by reverting code** — the
data is gone. For any future destructive change:

1. **Expand:** ship code that stops reading/writing the column or table first.
2. **Contract:** drop it in a *later* release, once the expand deploy is stable.

This keeps every single deploy independently reversible. Before applying a
destructive migration in production:

- Take and **verify** a backup: `bun run db:backup` (see the
  [backup/restore runbook](./compliance/backup-restore-runbook.md)).
- Apply on a staging replica first and confirm the app boots + the smoke suite
  passes (`bun run ops:smoke`).
- Consider a CI check that flags `DROP`/`ALTER … DROP` in new migrations for an
  explicit human sign-off.

### 2. Application rollback

Code deploys (non-destructive) roll back by redeploying the previous release:

- **PM2:** keep the previous release dir and `pm2 reload <app>` after switching
  the `current` symlink back (or `pm2 reload` the prior fork). One command,
  no data change.
- **Containers:** redeploy the previous image tag.

Pair a rollback with an incident entry — see the
[incident-response runbook](./compliance/incident-response-runbook.md).

### 3. Restore drills (RTO/RPO evidence)

`dr-restore-drill.yml` runs on a schedule: backup → encrypt → restore into an
isolated Postgres → verify. Treat a green drill as the recurring evidence that
the **restore path actually works** (an untested backup is not a backup). Record
the run duration as the measured RTO and the backup interval as the RPO in the
[backup/restore runbook](./compliance/backup-restore-runbook.md).

---

## Automated staging deploy

`deploy-staging.yml` is a **manual** (`workflow_dispatch`) workflow that ships the
current `main` to a staging host that matches the README's PM2 + nginx model,
then chains the validation suite. It is deliberately not push-triggered — promote
explicitly.

**Required repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
| --- | --- |
| `STAGING_SSH_HOST` | staging server hostname/IP |
| `STAGING_SSH_USER` | deploy user (e.g. `zerotrust`) |
| `STAGING_SSH_KEY` | private key authorized on the host |
| `STAGING_APP_DIR` | checkout path on the host (e.g. `/home/zerotrust/app`) |

**What it runs on the host** (the README's "Deploying updates" steps):

```bash
cd "$STAGING_APP_DIR" && git pull
bun install && bun run db:migrate && bun run build && pm2 restart zerotrust-api
cd packages/ui && bun install && bun run build && pm2 restart zerotrust-ui
```

After SSH deploy it dispatches `staging-validation.yml` (or run it manually) so
ops-smoke + Lighthouse + ZAP confirm the release. Promote to production with the
README's manual steps once staging is green.

> **Other targets** (Docker/Fly/Render/Kubernetes): swap the SSH job for your
> platform's deploy action; keep the post-deploy `staging-validation.yml` call so
> the same exit-criteria gates apply everywhere.

---

## Release versioning

Commits follow [Conventional Commits](https://www.conventionalcommits.org);
`semantic-release` derives the version + CHANGELOG from them (`bun run release`).
Keep `bun run lint` and `bun run type-check` green — Husky enforces them on
commit/push.
