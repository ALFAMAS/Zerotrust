# Deployment & CI/CD

How code gets from a PR to staging/production, and what gates it along the way.
Reference for the **CI/CD & Documentation** deliverable.

- **Automated production deploy:** `.github/workflows/deploy-production.yml`
  (manual `workflow_dispatch` — § Production deploy below). Host steps mirror the
  README PM2 + nginx model; post-deploy runs `ops:smoke` only (not Lighthouse/ZAP
  against live production).
- **Operator sign-off checklist:** [`production-checklist.md`](./production-checklist.md)
  (audit-backed tables with P0/P1/P2 status per category).
- **Automated staging deploy:** `.github/workflows/deploy-staging.yml` (below).

---

## Pipeline overview

```
 PR / push ──▶  ci.yml (gating)            manual ──▶ deploy-staging.yml ──▶ staging-validation.yml
               ├─ Lint & Type Check                   (build + ship to host)   (smoke · Lighthouse · ZAP)
               ├─ Tests (+ coverage, SDK,
               │   integration & shadcn audits)        manual ──▶ deploy-production.yml ──▶ ops:smoke
               ├─ SAST & Dependency Scans              weekly/manual ──▶ dr-restore-drill.yml
               │   (Semgrep · Trivy · bun audit)                    (backup → restore → verify)
               ├─ Build UI
               ├─ Playwright E2E & a11y smoke
               └─ Load & Chaos (k6)
```

### `ci.yml` — runs on every push/PR to `main`

| Job | Gates | Notes |
| --- | --- | --- |
| **Lint & Type Check** | Biome + `bun audit --prod` + `tsc` | dependency audit is blocking (high+) |
| **Tests** | Vitest suite; SDK-drift, API/UI matrix & shadcn report committed-checks | API + UI coverage are **blocking ratchet gates** (~67% / ~55% line floors, raised as coverage improves toward the 85% target — see `vitest.config.ts` and `packages/ui/vitest.config.ts`; CI runs `test:coverage` and `test:coverage:ui`) |
| **SAST & Dependency Scans** | Semgrep (`p/owasp-top-ten`) + Trivy filesystem (`aquasecurity/trivy-action@0.35.0`, Trivy v0.69.3) | both blocking on CRITICAL/HIGH; complements `bun audit` in the lint job |
| **Build UI** | `next build` | |
| **Playwright E2E & a11y** | full-stack smoke against a started API+UI | needs the app running with Postgres+Redis services |
| **Load & Chaos (k6)** | `tests/load/*.k6.js` | publishes k6 result artifacts; p95 thresholds enforced here |

### `staging-validation.yml` — manual (`workflow_dispatch`) or chained from deploy

Validates a **already-deployed** staging environment. Inputs: `staging_url`,
`api_url`. Jobs: **ops-smoke** (`/health`, `/metrics`, `/version`, trace header),
**Lighthouse** (`/`, `/login`, `/register` vs `.lighthouserc.json`), **OWASP ZAP**
baseline DAST, **k6** load suite. Callable via `workflow_call` from
`deploy-staging.yml` when `STAGING_UI_URL` + `STAGING_API_URL` variables are set.
This is where the **p95**, **Lighthouse>90**, and **DAST** exit criteria are
measured — run it after every staging deploy and archive the artifacts as evidence.

### `dr-restore-drill.yml` — scheduled + manual

Backs up → encrypts → restores into an isolated Postgres → verifies. This is the
recurring evidence for the **DR validated** criterion (see the
[backup/restore runbook](./compliance/backup-restore-runbook.md)).

---

## Docker Compose (full stack)

Local and staging-style container deploys use root `docker-compose.yml`:

| Service | Image / build | Host port | Notes |
| --- | --- | --- | --- |
| `postgres` | `postgres:16-alpine` | 5432 | Dev credentials only |
| `redis` | `redis:7-alpine` | 6379 | `requirepass` + `noeviction` for BullMQ |
| `zerotrust` | Root `Dockerfile` | 3000 | API; `WORKER_MODE=true` defers schedulers to worker |
| `zerotrust-worker` | Root `Dockerfile` | — | `bun dist/worker.js` |
| `zerotrust-ui` | `packages/ui/Dockerfile` | 3001 | Next.js standalone (`output: standalone`) |

Start the API + worker + data plane (UI optional):

```bash
docker compose up -d postgres redis zerotrust zerotrust-worker
docker compose up -d zerotrust-ui   # after API is healthy
```

Or the full stack in one command:

```bash
docker compose up -d
```

Open the UI at `http://localhost:3001`. The compose file bakes
`NEXT_PUBLIC_ZEROTRUST_URL=http://localhost:3000` at **UI image build time** so
browser calls reach the published API port. For staging/production images, pass
build args (and use `ZEROTRUST_ENFORCE_PUBLIC_API_URL=true` per § OPS-2):

```bash
docker build -f packages/ui/Dockerfile -t zerotrust-ui:latest \
  --build-arg NEXT_PUBLIC_ZEROTRUST_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_APP_URL=https://app.example.com \
  .
```

The UI image runs `node packages/ui/server.js` from the Next.js standalone
trace rooted at the monorepo (`outputFileTracingRoot` in `packages/ui/next.config.ts`).

See also [`reference-architecture.md`](./reference-architecture.md) Blueprint 2
(containers) for replica counts and production env wiring.

**Optional platform services** (OpenSearch, Uptime Kuma, GlitchTip, Grafana/Loki/Tempo,
PostHog) are documented in [`infra/README.md`](./infra/README.md) with compose overlays
`docker-compose.platform.yml` and extended `docker-compose.observability.yml`.

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
  **Deploy sign-off:** follow § Metrics auth verification (OPS-1) below.
- **`CORS_ALLOWED_ORIGINS` is set** — an empty allowlist fails closed in
  production (no cross-origin access), so set it to your app/admin origins.
- **Backups are encrypted** — set `BACKUP_ENCRYPTION_KEY_HEX` and
  `BACKUP_REQUIRE_ENCRYPTION=true` so a plaintext dump is never written.
- **Background jobs have a single owner** — production API replicas should set
  `WORKER_MODE=true` so schedulers and queue consumers are deferred; run exactly
  one dedicated worker with `bun run src/worker.ts`. If a production API process
  starts schedulers without `WORKER_MODE=true`, startup emits a warning because
  every API replica would otherwise run the same intervals.

### Metrics auth verification (OPS-1)

Production boot **refuses to start** without `METRICS_AUTH_TOKEN`
(`src/config/env.ts`). Before go-live and after every production deploy, confirm
the scrape endpoint is token-gated and Prometheus (or your auth proxy) sends the
matching bearer token.

#### 1. Generate and set the token

```bash
export METRICS_AUTH_TOKEN="$(openssl rand -hex 32)"
# Add to API env (PM2 ecosystem, Coolify, K8s secret, etc.)
```

For VM/PM2 Prometheus, write the same value to a root-owned file (mode `600`):

```bash
sudo install -m 600 /dev/stdin /etc/zerotrust/metrics-token <<<"$METRICS_AUTH_TOKEN"
```

For local `docker-compose.observability.yml`, copy the example and paste the token,
uncomment `authorization` in `monitoring/prometheus.yml`, and add a bind mount:

```bash
cp monitoring/metrics-token.example monitoring/metrics-token
# edit monitoring/metrics-token — single line, no trailing newline required
# docker-compose.observability.yml: add under prometheus.volumes:
#   - ./monitoring/metrics-token:/etc/prometheus/metrics-token:ro
```

#### 2. Verify with curl (pre-launch sign-off)

Replace `https://api.example.com` with your public API base URL.

```bash
API=https://api.example.com

# Must reject unauthenticated scrapes
curl -fsS -o /dev/null -w "%{http_code}\n" "$API/metrics"
# expected: 401

# Must succeed with the bearer token
curl -fsS -H "Authorization: Bearer $METRICS_AUTH_TOKEN" "$API/metrics" | head
# expected: 200 and Prometheus text (e.g. zerotrust_request_duration_seconds)
```

Archive the command output (or `bun run ops:smoke` log) in
[`docs/compliance/`](./compliance/README.md) evidence per environment.

#### 3. Automated smoke (`ops:smoke`)

When `METRICS_AUTH_TOKEN` is set in the environment, `bun run ops:smoke`:

1. Asserts `/metrics` returns **401** without `Authorization`.
2. Asserts `/metrics` returns **200** with `Authorization: Bearer <token>`.

```bash
API_URL=https://api.example.com METRICS_AUTH_TOKEN="$METRICS_AUTH_TOKEN" bun run ops:smoke
```

`staging-validation.yml` passes `secrets.METRICS_AUTH_TOKEN` into the ops-smoke
job — configure that repository secret to match staging/production API env.

#### 4. Sign-off template

| Check | Pass |
| ----- | ---- |
| `METRICS_AUTH_TOKEN` set in production API env | ☐ |
| Prometheus scrape (or private-network proxy) uses matching Bearer token | ☐ |
| `curl` without token → 401; with token → 200 | ☐ |
| `bun run ops:smoke` green with `METRICS_AUTH_TOKEN` | ☐ |

Link completed rows to [`production-checklist.md`](./production-checklist.md) §
Pre-launch sign-off item 10.

### Public API URL verification (OPS-2)

The Next.js UI bakes `NEXT_PUBLIC_ZEROTRUST_URL` at **build time**. If it still
points at `http://localhost:1337`, production users cannot authenticate or call
the API. Verify before go-live and after every UI deploy.

#### 1. Set the URL at UI build time

```bash
# packages/ui/.env.local (or PM2 / Coolify UI service env)
NEXT_PUBLIC_ZEROTRUST_URL=https://api.example.com   # no trailing slash
```

Production UI builds should enable the fail-fast guard:

```bash
cd packages/ui
ZEROTRUST_ENFORCE_PUBLIC_API_URL=true \
  NEXT_PUBLIC_ZEROTRUST_URL=https://api.example.com \
  bun run build
```

`ZEROTRUST_ENFORCE_PUBLIC_API_URL=true` refuses localhost or unset values.
CI omits this flag and keeps the localhost default for `next build` smoke.

#### 2. Verify with curl (pre-launch sign-off)

Replace hosts with your public UI and API URLs.

```bash
UI=https://app.example.com
API=https://api.example.com

curl -fsS "$UI/api/deploy-config"
# expected: {"apiUrl":"https://api.example.com"}

curl -fsS "$UI/api/deploy-config" | jq -e --arg api "$API" '.apiUrl == $api'
# expected: exit 0
```

#### 3. Automated smoke (`ops:smoke`)

When `UI_URL` (or `STAGING_URL`) is set alongside `API_URL`, `bun run ops:smoke`
fetches `/api/deploy-config` on the UI and asserts the baked `apiUrl` matches
`API_URL`:

```bash
UI_URL=https://app.example.com API_URL=https://api.example.com bun run ops:smoke
```

`staging-validation.yml` passes `inputs.staging_url` as `UI_URL` and
`inputs.api_url` as `API_URL`.

#### 4. Sign-off template

| Check | Pass |
| ----- | ---- |
| `NEXT_PUBLIC_ZEROTRUST_URL` set to public API (HTTPS in production) | ☐ |
| UI built with `ZEROTRUST_ENFORCE_PUBLIC_API_URL=true` | ☐ |
| `curl $UI/api/deploy-config` → `apiUrl` matches public API | ☐ |
| `bun run ops:smoke` green with `UI_URL` + `API_URL` | ☐ |

Link completed rows to [`production-checklist.md`](./production-checklist.md) §
Pre-launch sign-off item 12.

### Production alerting wiring (OBS-1)

Prometheus SLO rules (`monitoring/alerts.yml`) fire **page**-severity alerts for
5xx rate, p95 latency, and missing scrapes. Operators must route those alerts
from Alertmanager to on-call (PagerDuty, Slack, or equivalent) and archive
wiring evidence per environment.

#### 1. Local / staging stack (no secrets)

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d prometheus alertmanager
bun run ops:verify-alerting
```

- Prometheus UI: `http://localhost:9090` — **Alerts** tab shows rule state.
- Alertmanager UI: `http://localhost:9093` — review grouped alerts (local config
  has no outbound receiver).

`monitoring/prometheus.yml` points at `alertmanager:9093`; compose mounts
`monitoring/alertmanager.yml` by default.

#### 2. Production receivers (PagerDuty + Slack)

PagerDuty and Slack credentials are **environment-specific** — never commit them.

```bash
cp monitoring/alertmanager.production.example.yml monitoring/alertmanager.production.yml
# Edit monitoring/alertmanager.production.yml:
#   REPLACE_WITH_PAGERDUTY_EVENTS_API_V2_KEY  → Events API v2 integration key
#   REPLACE_WITH_SLACK_INCOMING_WEBHOOK_URL    → incoming webhook URL
```

Mount the production file when starting Alertmanager:

```bash
export ALERTMANAGER_CONFIG=./monitoring/alertmanager.production.yml
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d alertmanager
```

For VM/Kubernetes deploys, place the same YAML at a root-owned path (mode `600`)
and point your Alertmanager service at it.

#### 3. Verify wiring (`ops:verify-alerting`)

```bash
# After Prometheus + Alertmanager are reachable
PROMETHEUS_URL=http://localhost:9090 \
ALERTMANAGER_URL=http://localhost:9093 \
bun run ops:verify-alerting

# Optional: post a synthetic alert (confirm it appears in Alertmanager UI or Slack)
VERIFY_ALERTING_SEND_TEST=true bun run ops:verify-alerting
```

The script asserts:

1. Alertmanager `/-/healthy` returns OK.
2. Prometheus loaded the `zerotrust-slo` rule group (three alerts).
3. Prometheus reports at least one active Alertmanager target.

Archive command output in [`docs/compliance/`](./compliance/README.md) evidence
per [`monitoring-evidence-procedure.md`](./compliance/monitoring-evidence-procedure.md).

#### 4. End-to-end paging test (production sign-off)

After production receivers are configured:

1. Temporarily lower a rule threshold in a **staging** Prometheus (or use
   `VERIFY_ALERTING_SEND_TEST=true` against staging Alertmanager).
2. Confirm the alert appears in Alertmanager **and** the on-call channel
   (PagerDuty incident or Slack message).
3. Resolve the alert and confirm the resolved notification (when `send_resolved: true`).

#### 5. Sign-off template

| Check | Pass |
| ----- | ---- |
| `monitoring/alerts.yml` rules loaded in Prometheus | ☐ |
| Prometheus `alerting.alertmanagers` targets Alertmanager | ☐ |
| Production `alertmanager.production.yml` mounted (not committed) | ☐ |
| PagerDuty/Slack placeholders replaced with live credentials | ☐ |
| `bun run ops:verify-alerting` green | ☐ |
| Synthetic or staging-fired alert received on on-call channel | ☐ |

Link completed rows to [`production-checklist.md`](./production-checklist.md) §
Pre-launch sign-off item 13 and § Observability.

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

## VPS network hardening (SEC-27)

Operator runbook for internet-facing **single-VM** deploys (Blueprint 1 in
[`reference-architecture.md`](./reference-architecture.md), Coolify/Vultr per
[`security.md`](./security.md) §9) where PostgreSQL and/or Redis run on the
same host as the app.

**Skip this section** when Postgres and Redis are **managed off-box** (Neon,
Supabase, Upstash, RDS, ElastiCache, etc.) — those providers own network
isolation. Confirm `DATABASE_URL` / `REDIS_URI` use TLS where offered and
provider IP allowlists where available.

### Goals

| Control | Why |
| --- | --- |
| Default-deny inbound firewall | Only HTTP(S) and ops SSH reach the host |
| Postgres bound to loopback / private NIC | Port 5432 must not answer on the public IP |
| Redis bound to loopback / private NIC + `requirepass` | Port 6379 must not answer on the public IP |
| SSH public-key auth only | No password or root login over SSH |

### 1. Host firewall (`ufw`)

On Ubuntu/Debian (adjust for `firewalld` / cloud security groups if your
provider manages the edge):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
# Prefer restricting SSH to your ops IP:
# sudo ufw allow from <ops-ip>/32 to any port 22 proto tcp
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

**Coolify note:** Coolify may install its own firewall rules. Reconcile with
`ufw status` so Postgres/Redis are not accidentally exposed while proxy ports
stay open.

**Cloud SGs:** If the VPS sits behind a provider security group, mirror the
same policy there (deny 5432/6379 inbound from `0.0.0.0/0`) — host `ufw` alone
is not enough when the hypervisor forwards those ports.

### 2. SSH hardening

Edit `/etc/ssh/sshd_config` (or a drop-in under `/etc/ssh/sshd_config.d/`):

```text
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
```

Reload and verify you can still connect with your key **before** closing the
session:

```bash
sudo systemctl reload sshd
```

### 3. PostgreSQL — private bind only

**Native install** (`apt install postgresql`): in `postgresql.conf`:

```text
listen_addresses = '127.0.0.1'
```

Use a private VPC address instead of loopback only when the DB runs on a
separate NIC in the same private network (never `0.0.0.0` on an internet-facing
host).

In `pg_hba.conf`, allow only loopback or the app subnet — pair with the dual
roles from § Postgres roles above:

```text
host    zerotrust    zerotrust_app_user    127.0.0.1/32    scram-sha-256
```

Restart: `sudo systemctl restart postgresql`.

**Docker on the same VPS:** do **not** publish Postgres to all interfaces.
`docker-compose.yml` in this repo exposes `5432:5432` for **local dev only**.
For production on one host, either omit `ports:` (app containers join the
compose network) or bind to loopback:

```yaml
ports:
  - "127.0.0.1:5432:5432"   # only if a host-native API must reach the container
```

Runtime `DATABASE_URL` should use `127.0.0.1`, the Docker service name
(`postgres`), or a private hostname — **not** the VPS public IP when co-located.

### 4. Redis — private bind + AUTH

Production requires `REDIS_URI` (see `.env.example`). Self-hosted Redis must
not listen on `0.0.0.0`.

**Native install** — in `redis.conf`:

```text
bind 127.0.0.1 -::1
protected-mode yes
requirepass <strong-secret>
```

Restart: `sudo systemctl restart redis`.

**Docker:** same rule as Postgres — no `6379:6379` on `0.0.0.0` in production.
The dev compose file uses `--requirepass` on an internal network only; mirror
that pattern and set:

```text
REDIS_URI=redis://:<password>@127.0.0.1:6379
```

(or `redis://:<password>@redis:6379` when the API runs in the same compose
stack).

### 5. Verification (before DNS cutover)

Run these checks and archive output in
[`compliance/evidence/`](./compliance/evidence/README.md) (pre-launch gate #8 in
[`production-checklist.md`](./production-checklist.md)).

**From outside the VPS** (another machine on the internet):

```bash
nmap -p 22,80,443,5432,6379 <vps-public-ip>
```

Expected: **22, 80, 443** open (ideally 22 restricted to ops IPs); **5432 and
6379 closed/filtered**.

**On the VPS:**

```bash
sudo ss -tlnp | grep -E ':(5432|6379)\s'
```

Expected: listeners on `127.0.0.1`, `[::1]`, or a `10.x`/`172.16`/`192.168`
address — **not** `0.0.0.0` or the public IP.

**Application path:**

```bash
curl -fsS http://127.0.0.1:1337/health
psql "$DATABASE_URL" -c 'SELECT 1'
redis-cli -u "$REDIS_URI" ping
```

All three must succeed while external `nmap` shows database ports closed.

### 6. Sign-off template

```text
Date:
Operator:
VPS hostname / provider:
Postgres: [ ] managed off-box  [ ] loopback/private bind verified
Redis:    [ ] managed off-box  [ ] loopback/private bind + AUTH verified
ufw status verbose: (paste)
External nmap 5432/6379: closed/filtered
App /health + DB + Redis ping: pass
```

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

## Postgres roles (app vs migrator — SEC-25)

Production reference deploys use **two database credentials**:

| Role | Env var | Used by | Capabilities |
| --- | --- | --- | --- |
| **App** | `DATABASE_URL` | API + worker runtime | `SELECT`/`INSERT`/`UPDATE`/`DELETE` only; subject to `FORCE ROW LEVEL SECURITY` on org-scoped tables |
| **Migrator** | `DATABASE_MIGRATOR_URL` | `bun run db:migrate` / deploy job only | DDL (`CREATE`/`ALTER`/`DROP`) for schema changes |

Local dev may keep a single superuser (`zerotrust`) in `docker-compose.yml`. Before
going internet-facing:

1. Apply migrations once with the existing deploy user.
2. Run `scripts/ops/setup-postgres-roles.sql` as a superuser (creates
   `zerotrust_app_user` + `zerotrust_migrator_user` — **change placeholder passwords**).
3. Point runtime `DATABASE_URL` at the app user; run future migrations with
   `DATABASE_MIGRATOR_URL` (or export it only in the CI/deploy migrate step).

Kubernetes: the migrate Job should use `DATABASE_MIGRATOR_URL`; Deployments use
`DATABASE_URL`. See `docs/reference-architecture.md` § Production security defaults.

### Baseline `db:push` databases for `db:migrate` (MIG-3)

Environments that were first provisioned with `bun run db:push` have the application
schema but **not** the Postgres RLS policies, audit-immutability triggers, or
`drizzle.__drizzle_migrations` journal rows that `db:migrate` relies on. Before
switching such a database to the migrate deploy path:

1. **Backup and verify** — `bun run db:backup` (see
   [backup/restore runbook](./compliance/backup-restore-runbook.md)).
2. **Preview** — `bun run db:baseline-push -- --dry-run` with `DATABASE_URL` pointed
   at the target (migrator/superuser credentials).
3. **Apply** — `bun run db:baseline-push` (applies migrations `0031`, `0035`, `0036`,
   `0038`, backfills missing `drizzle.__drizzle_migrations` rows from
   `drizzle/meta/_journal.json`, verifies RLS + audit triggers).
4. **Confirm** — `SELECT * FROM pg_policies WHERE schemaname = 'public';` shows policies
   on org-scoped tables; `bun run db:migrate` on staging should report nothing pending.

Fresh databases should use `bun run db:migrate` from the start — this baseline step is
only for legacy `db:push` environments.

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
chosen ref to a staging host that matches the README's PM2 + nginx model, waits for
the API health gate, then **chains** `staging-validation.yml` (ops-smoke · Lighthouse
· ZAP · k6). It is deliberately not push-triggered — promote explicitly.

### Staging secrets (INF-2)

Configure in **Settings → Secrets and variables → Actions**. Create a **`staging`**
[environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
with optional required reviewers before the first real deploy.

**Repository secrets** (deploy + validation):

| Secret | Purpose |
| --- | --- |
| `STAGING_SSH_HOST` | Staging server hostname/IP |
| `STAGING_SSH_USER` | Deploy user (e.g. `zerotrust`) |
| `STAGING_SSH_KEY` | Private key authorized on the host (`-----BEGIN …`) |
| `STAGING_APP_DIR` | Checkout path on the host (e.g. `/home/zerotrust/app`) |
| `METRICS_AUTH_TOKEN` | Must match `METRICS_AUTH_TOKEN` on the staging API — ops-smoke asserts bearer-gated `/metrics` (see § Metrics auth verification) |

**Repository variables** (public URLs — no trailing slash):

| Variable | Purpose |
| --- | --- |
| `STAGING_UI_URL` | Public staging UI origin (e.g. `https://staging.example.com`) — Lighthouse, ZAP, deploy-config smoke |
| `STAGING_API_URL` | Public staging API origin (e.g. `https://api-staging.example.com`) — health gate, ops-smoke, k6 |

Until SSH secrets are set, `deploy-staging.yml` is a **safe no-op** (notice + exit 0).
When SSH secrets exist but URL variables are missing, deploy runs but post-deploy
validation is skipped with a notice. Set `skip_validation: true` on manual dispatch
to deploy without running Lighthouse/ZAP/k6.

**What it runs on the host** (the README's "Deploying updates" steps):

```bash
cd "$STAGING_APP_DIR" && git pull
bun install && bun run db:migrate && bun run build && pm2 restart zerotrust-api
cd packages/ui && bun install && bun run build && pm2 restart zerotrust-ui
```

After a green validation run, archive workflow artifacts (Lighthouse, k6 JSON) in
[`docs/compliance/`](./compliance/README.md) evidence. Promote to production with the
README's manual steps once staging is green.

`staging-validation.yml` remains available for **manual** `workflow_dispatch` against
any already-deployed environment (pass `staging_url` + `api_url` inputs).

> **Other targets** (Docker/Fly/Render/Kubernetes): swap the SSH job for your
> platform's deploy action; keep the post-deploy `staging-validation.yml` reusable call
> so the same exit-criteria gates apply everywhere.

---

## Automated production deploy

`deploy-production.yml` is a **manual** (`workflow_dispatch`) workflow that ships the
chosen ref to a production host matching the README's PM2 + nginx model, waits for
the API health gate, then runs `ops:smoke` (health · metrics · version ·
deploy-config). It is deliberately not push-triggered — promote explicitly after
staging is green. Full Lighthouse/ZAP/k6 gates stay on staging; do not baseline-DAST
production on every release.

### Production secrets (INF-3)

Configure in **Settings → Secrets and variables → Actions**. Create a **`production`**
[environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
with **required reviewers** before the first real deploy.

**Environment secrets** (deploy + smoke):

| Secret | Purpose |
| --- | --- |
| `PRODUCTION_SSH_HOST` | Production server hostname/IP |
| `PRODUCTION_SSH_USER` | Deploy user (e.g. `zerotrust`) |
| `PRODUCTION_SSH_KEY` | Private key authorized on the host (`-----BEGIN …`) |
| `PRODUCTION_APP_DIR` | Checkout path on the host (e.g. `/home/zerotrust/app`) |
| `METRICS_AUTH_TOKEN` | Must match `METRICS_AUTH_TOKEN` on the production API — ops-smoke asserts bearer-gated `/metrics` (see § Metrics auth verification) |

**Repository variables** (public URLs — no trailing slash):

| Variable | Purpose |
| --- | --- |
| `PRODUCTION_UI_URL` | Public production UI origin (e.g. `https://app.example.com`) — deploy-config smoke |
| `PRODUCTION_API_URL` | Public production API origin (e.g. `https://api.example.com`) — health gate, ops-smoke |

Until SSH secrets are set, `deploy-production.yml` is a **safe no-op** (notice + exit 0).
When SSH secrets exist but `PRODUCTION_API_URL` is missing, deploy runs but the health
gate and ops-smoke job are skipped with a notice. Set `skip_smoke: true` on manual
dispatch to deploy without post-deploy smoke checks.

**What it runs on the host** (production PM2 topology — includes the dedicated worker):

```bash
cd "$PRODUCTION_APP_DIR" && git pull
bun install && bun run db:migrate && bun run build
pm2 restart zerotrust-api && pm2 restart zerotrust-worker
cd packages/ui && bun install && bun run build && pm2 restart zerotrust-ui
```

Ensure the host UI build uses `ZEROTRUST_ENFORCE_PUBLIC_API_URL=true` and
`NEXT_PUBLIC_ZEROTRUST_URL` pointing at the public API (see § Public API URL
verification). Archive a green `ops:smoke` log in
[`docs/compliance/`](./compliance/README.md) evidence after each production deploy.

**Promotion checklist:**

1. Staging deploy green (`deploy-staging.yml` + `staging-validation.yml`).
2. Required reviewers approve the `production` environment job.
3. Dispatch `deploy-production.yml` with the same ref (tag or `main` SHA).
4. Confirm health gate + ops-smoke pass; link artifacts in compliance evidence.

> **Other targets** (Docker/Fly/Render/Kubernetes): swap the SSH job for your
> platform's deploy action; keep the post-deploy `ops:smoke` step so OPS-1/OPS-2
> checks still run against the live URLs.

---

## Release versioning

Commits follow [Conventional Commits](https://www.conventionalcommits.org);
`semantic-release` derives the version + CHANGELOG from them (`bun run release`).
Keep `bun run lint` and `bun run type-check` green — Husky enforces them on
commit/push.

### `release.yml` — automated releases on `main`

On every push to `main`, `.github/workflows/release.yml` runs `bun run release`
with `GITHUB_TOKEN` and:

- Creates/updates the Git tag + GitHub Release notes (`@semantic-release/github`)
- Updates `CHANGELOG.md` (`@semantic-release/changelog`)
- Commits `CHANGELOG.md` + `package.json` back to `main` with a `[skip ci]` message
  (`@semantic-release/git`)

No additional secrets are required beyond the default `GITHUB_TOKEN`, but the repo
must allow the workflow token to write contents (tags/commits/releases).
