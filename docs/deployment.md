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
| **Tests** | Vitest suite; SDK-drift, API/UI matrix & shadcn report committed-checks | coverage is a **blocking ratchet gate** (~60% floor, raised as coverage improves toward the 85% target — see `vitest.config.ts`) |
| **SAST & Dependency Scans** | Semgrep (`p/owasp-top-ten`) + Trivy filesystem (`aquasecurity/trivy-action@0.35.0`, Trivy v0.69.3) | both blocking on CRITICAL/HIGH; complements `bun audit` in the lint job |
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

- **`METRICS_AUTH_TOKEN` is set (REQUIRED in production)** — `/metrics` is
  **open by default**. Unauthenticated it leaks internal route/label cardinality
  and traffic patterns, so it **must** be token-gated (`Authorization: Bearer
  <token>`) or kept on a private scrape network behind an auth proxy. Generate
  with `openssl rand -hex 32`. See the reference architecture for token-gated
  Prometheus scrape configs (Kubernetes ServiceMonitor + VM/PM2 `prometheus.yml`).
- **`CORS_ALLOWED_ORIGINS` is set** — an empty allowlist fails closed in
  production (no cross-origin access), so set it to your app/admin origins.
- **Backups are encrypted** — set `BACKUP_ENCRYPTION_KEY_HEX` and
  `BACKUP_REQUIRE_ENCRYPTION=true` so a plaintext dump is never written.
- **Background jobs have a single owner** — production API replicas should set
  `WORKER_MODE=true` so schedulers and queue consumers are deferred; run exactly
  one dedicated worker with `bun run src/worker.ts`. If a production API process
  starts schedulers without `WORKER_MODE=true`, startup emits a warning because
  every API replica would otherwise run the same intervals.

### Production background-worker topology

Use one of these two topologies deliberately:

1. **Recommended clustered production:** API replicas set `WORKER_MODE=true` and
   only initialize request/producer paths. One separate worker process runs
   `bun run src/worker.ts` and owns the BullMQ consumers — email queue, Stripe
   webhook queue, and the scheduled-job queue. Keep the worker replica count at
   **1** as a deliberate topology choice — BullMQ delivers each job to exactly
   one consumer by design, so extra worker replicas are a guardrail for
   throughput, not a correctness requirement.
2. **Single-process development / small deploy:** omit `WORKER_MODE=true`; the
   API process starts schedulers in-process. This is fine for local dev and one
   API replica, but production startup logs a warning so clustered deploys do
   not accidentally duplicate background work.

Example production process split:

```bash
# API replicas (N instances behind the load balancer)
WORKER_MODE=true bun run src/api/server.ts

# Dedicated background worker (exactly one instance)
bun run src/worker.ts
```

### Queue-backed cron scheduling (B5)

Scheduled jobs declared in `src/jobs/registry.ts` (data retention, notification
email fallback, billing lifecycle, daily `pg_dump` backup, audit anchoring) run
through a BullMQ job scheduler (`src/jobs/scheduler.ts`) instead of a raw
`setInterval` loop:

- **Scheduling:** `Queue.upsertJobScheduler()` upserts one repeatable job per
  registry entry, using its `intervalHours` as an every-X-hours cadence — the
  BullMQ equivalent of a cron entry, without a separate cron daemon.
- **Retry/backoff:** each job gets up to 3 attempts with exponential backoff
  (starting at 60s) via `defaultJobOptions`, matching the pattern already used
  by the email queue (`emailQueue.ts`) and the Stripe webhook queue
  (`stripeWebhookQueue.ts`).
- **Dead-letter visibility:** failed attempts are retained (`removeOnFail`)
  instead of vanishing after a failed `setInterval` tick; `getFailedScheduledJobs()`
  exposes them for ops inspection.
- **Idempotent replay + failure recovery:** jobs with a registry `idempotencyKey`
  (e.g. `audit.anchor`) are marked complete in Redis only *after* a successful
  run. Replaying an already-completed tick is a no-op; a failed attempt is not
  marked complete, so a BullMQ retry actually re-executes the handler. Proven
  by `src/__tests__/scheduler.test.ts`.
- **Single-instance execution:** BullMQ atomically hands each scheduled job to
  exactly one consumer, so the previous Redis `SET NX PX` leader lock is no
  longer needed to prevent duplicate execution across replicas.

Without `REDIS_URI` set, BullMQ cannot connect and scheduled jobs do not run —
same behavior as before this change (all current registry jobs are
single-instance).

---

## Elasticsearch (optional)

Elasticsearch is **not required** for production. By default
(`ELASTICSEARCH_ENABLED=false`, the unset default):

- **Search** — `/search` and `/search/smart` use Postgres full-text search
  (`websearch_to_tsquery` ranking across users, orgs, and support tickets).
- **Audit** — tamper-evident SHA-256 hash-chained rows in Postgres are the
  source of truth; the ES audit pipeline is a no-op.
- **Logging** — structured JSON logs go to stdout; ES log streaming is skipped.

Enable ES only when you need Elasticsearch-backed search at scale or Kibana/SIEM
mirroring for large tenants:

```bash
ELASTICSEARCH_ENABLED=true
ELASTICSEARCH_HOST=your-es-host
ELASTICSEARCH_PORT=9200
ELASTICSEARCH_INDEX_PREFIX=zerotrust
```

With Docker Compose, start the optional stack profile:

```bash
docker compose --profile elasticsearch up
```

When ES is enabled, search prefers the `@elastic/elasticsearch` client (with
Postgres FTS fallback on failure), the audit pipeline bulk-indexes masked events,
and info/warn/error logs stream to daily indices. Kibana dashboards under
`kibana/` require this opt-in path.

---

## Read replica routing

When `DATABASE_URL_READ_REPLICA` is set, read-heavy API handlers call
`getReadDb()` instead of the primary connection. Mutations, auth/session
validation, idempotent webhook claims, and any read that must reflect a write
from the same request stay on `getDb()`.

### What is routed to the replica

- Admin list/detail/analytics: users, sessions, roles, JIT grants, audit logs,
  feedback, segments, attachments, revenue dashboard, CSV exports
- User/org dashboard reads: org lists, members, invites, support tickets, API
  keys, notifications, billing subscription/usage summaries, wallet transaction
  history, search (Postgres FTS fallback)
- Compliance/analytics reads: access-review lists, anomaly baselines, audit
  chain verification, webhook delivery logs

### Replica lag expectations

Managed Postgres replicas (Neon, RDS, Cloud SQL, etc.) typically lag **under
1 second** under normal load. Plan for these bounds when choosing replica-backed
endpoints:

| Scenario | Expected lag | User-visible effect |
| --- | --- | --- |
| Steady state | 0–500 ms | Admin dashboards and lists may omit rows written in the last sub-second |
| Write burst / bulk import | 1–5 s | New users, tickets, or notifications can appear briefly stale in list views |
| Replica catch-up / failover | up to 30 s | Treat replica health `degraded`/`unhealthy` in `/health` as a signal to fall back operationally |

**Acceptable stale reads:** paginated admin lists, analytics counters, CSV
exports, org member lists, notification feeds, and billing usage summaries.

**Stay on primary:** login/session validation, token refresh, password/MFA
changes, webhook idempotency claims, wallet auto-create on first read, and SOC 2
control seeding (write-on-first-read).

When no replica URL is configured, `getReadDb()` transparently returns the
primary connection — local dev and single-node deploys require no code changes.

Optional: set `DB_READ_REPLICA_STRICT=true` so the postgres driver opens replica
connections in `default_transaction_read_only` mode (writes fail fast at the
driver layer).

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
