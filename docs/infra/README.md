# Platform infrastructure stack

Operator guide for optional self-hosted services that pair with zerotrust:
OpenSearch, Uptime Kuma, PostHog, Grafana (full observability), GlitchTip, and
HashiCorp Vault (secrets).

For the broader OSS shortlist and integration rationale, see [`oss.md`](../../oss.md).

---

## Quick start

Core app (Postgres + Redis + API):

```bash
docker compose up -d postgres redis
bun dev
```

Full platform overlay (search, uptime, error tracking):

```bash
docker compose -f docker-compose.yml -f docker-compose.platform.yml up -d
```

Grafana full stack (metrics + logs + traces + dashboards):

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

Everything together:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  -f docker-compose.platform.yml \
  up -d
```

PostHog (separate — official hobby deploy):

```bash
./scripts/ops/posthog-hobby.sh
```

Validate compose syntax:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml -f docker-compose.platform.yml config
```

---

## Default URLs and ports

| Service | URL | Compose file |
| --- | --- | --- |
| zerotrust API | http://localhost:1337 | `docker-compose.yml` |
| zerotrust UI | http://localhost:3000 | `bun dev:ui` |
| Prometheus | http://localhost:9090 | `docker-compose.observability.yml` |
| Alertmanager | http://localhost:9093 | `docker-compose.observability.yml` |
| **Grafana** | http://localhost:3003 | `docker-compose.observability.yml` |
| **Loki** | http://localhost:3100 | `docker-compose.observability.yml` |
| **Tempo** (trace UI) | http://localhost:3200 | `docker-compose.observability.yml` |
| Tempo OTLP HTTP | http://localhost:4318 | `docker-compose.observability.yml` |
| **OpenSearch API** | http://localhost:9201 | `docker-compose.platform.yml` |
| **OpenSearch Dashboards** | http://localhost:5602 | `docker-compose.platform.yml` |
| **Uptime Kuma** | http://localhost:3002 | `docker-compose.platform.yml` |
| **GlitchTip** | http://localhost:8100 | `docker-compose.platform.yml` |
| **PostHog** | http://localhost (hobby default) | `scripts/ops/posthog-hobby.sh` |
| **HashiCorp Vault** | http://localhost:8200 | `docker-compose.platform.yml` |
| Jaeger (alternative traces) | http://localhost:16686 | `docker-compose.tracing.yml` |

---

## OpenSearch

OpenSearch provides an Elasticsearch-compatible REST API. zerotrust's optional
search/audit mirror uses the same client env vars as Elasticsearch.

### Start

```bash
docker compose -f docker-compose.yml -f docker-compose.platform.yml up -d opensearch opensearch-dashboards
```

### zerotrust integration

In `.env`:

```env
ELASTICSEARCH_ENABLED=true
ELASTICSEARCH_HOST=localhost
ELASTICSEARCH_PORT=9201
ELASTICSEARCH_INDEX_PREFIX=zerotrust
```

The API writes audit/search documents when enabled (`src/services/ops/search.service.ts`).
Postgres FTS remains the default; OpenSearch is for large-tenant full-text search
and Kibana/SIEM-style dashboards via OpenSearch Dashboards.

### Notes

- Security plugin is disabled for local dev only. For production-like staging, merge
  `docker-compose.platform.prod.example.yml` (requires `OPENSEARCH_ADMIN_PASSWORD`).
  Enable TLS and fine-grained access control before any internet-facing deploy.
- Host port `9201` avoids conflicting with the optional Elasticsearch profile
  (`9200`) in `docker-compose.yml`.

---

## Uptime Kuma

Synthetic monitoring and lightweight status pages.

### Start

```bash
docker compose -f docker-compose.yml -f docker-compose.platform.yml up -d uptime-kuma
```

### Suggested monitors

| Monitor | Target | Notes |
| --- | --- | --- |
| API health | `http://localhost:1337/health` | Liveness |
| API version | `http://localhost:1337/version` | Deploy fingerprint |
| UI deploy config | `http://localhost:3000/api/deploy-config` | OPS-2 public API URL check |
| Metrics (auth) | `http://localhost:1337/metrics` | Add `Authorization: Bearer <METRICS_AUTH_TOKEN>` header |

Aligns with `bun run ops:smoke` checks in [`deployment.md`](../deployment.md).

---

## Grafana full observability stack

Extends the existing Prometheus + Alertmanager overlay with Grafana, Loki, Tempo,
and optional Promtail log shipping.

### Components

| Component | Role |
| --- | --- |
| **Prometheus** | Scrapes zerotrust `/metrics` (see `monitoring/prometheus.yml`) |
| **Alertmanager** | Routes SLO alerts (`monitoring/alerts.yml`) |
| **Grafana** | Dashboards; datasources pre-provisioned from `monitoring/grafana/` |
| **Loki** | Log aggregation (`monitoring/loki/loki-config.yml`) |
| **Tempo** | Trace backend with OTLP HTTP on `:4318` |
| **Promtail** | Ships Docker container logs to Loki (`--profile logs`) |

### Start

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

Default Grafana login: `admin` / value of `GRAFANA_ADMIN_PASSWORD` (default `admin`).

**Dashboards** — provisioned from `monitoring/grafana/provisioning/dashboards/json/`:

| Dashboard | Contents |
| --- | --- |
| **zerotrust Overview** | API scrape health, request rate, 5xx ratio, p95 latency, auth/session metrics, Prometheus `up` targets, Loki logs, Tempo traces |

PromQL uses metrics exported by the API (`zerotrust_request_duration_seconds`, `zerotrust_auth_attempts_total`, …) scraped per `monitoring/prometheus.yml` job `zerotrust-api`.

### zerotrust integration

**Metrics** — set `METRICS_AUTH_TOKEN` in production and uncomment the Bearer
block in `monitoring/prometheus.yml` (see [`deployment.md`](../deployment.md) § OPS-1).

**Traces** — point OpenTelemetry at Tempo:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 bun dev
```

The API exporter is configured in `src/telemetry/tracer.ts`. When Tempo and Jaeger
both expose `:4318`, run only one trace backend at a time.

**Logs** — enable Promtail when Docker socket access is available:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile logs up -d promtail
```

#### Promtail on Windows

Promtail discovers containers via the Docker socket (`/var/run/docker.sock`) and
reads log files under `/var/lib/docker/containers`. That path model works on
**Linux** and **Docker Desktop with the WSL2 backend** (Linux VM owns the socket
and container log files).

| Environment | Promtail `--profile logs` | Notes |
| --- | --- | --- |
| Linux (native Docker) | Works | Default path — use `--profile logs` as documented |
| Docker Desktop + **WSL2** backend | Works | Enable WSL integration for your distro; run compose from WSL or ensure Desktop exposes the socket to the Linux VM |
| Docker Desktop + **Hyper-V** backend | Often broken | Socket/log paths may not match Promtail's Linux-oriented mounts |
| Windows native Docker (no WSL2) | **Not supported** | Promtail cannot mount `unix:///var/run/docker.sock` the same way |

**Workarounds on Windows without socket access:**

1. Run the observability stack from **WSL2** (recommended) with Docker Desktop's WSL2 engine.
2. Ship logs with **Grafana Alloy** or **Fluent Bit** on the host instead of Promtail.
3. Query **Loki** via `logcli` or push JSON logs manually for ad-hoc debugging.
4. Skip container log shipping locally; rely on Prometheus metrics + Tempo traces until production.

Promtail is gated behind the `logs` profile so Loki/Tempo/Grafana start cleanly on
Windows even when log shipping is unavailable.

---

## GlitchTip (Sentry-compatible)

Self-hosted error tracking compatible with zerotrust's existing Sentry SDK wiring.

### Start

```bash
# Generate a secret first (do not use the compose default in production)
export GLITCHTIP_SECRET_KEY="$(openssl rand -hex 32)"
docker compose -f docker-compose.yml -f docker-compose.platform.yml up -d glitchtip-web glitchtip-worker
```

**Production:** merge `docker-compose.platform.prod.example.yml` to disable open
registration (`ENABLE_USER_REGISTRATION=false`, `ENABLE_ORGANIZATION_CREATION=false`)
and require `GLITCHTIP_SECRET_KEY` at compose time.

### zerotrust integration

1. Open http://localhost:8100, create an organization and project.
2. Copy the project DSN.
3. Set in `.env` (API):

   ```env
   SENTRY_DSN=http://<public-key>@localhost:8100/<project-id>
   ```

4. Set the UI DSN in `packages/ui/.env.local` per `packages/ui/sentry.*.config.ts`.

GlitchTip uses a dedicated Postgres and Redis (`glitchtip-*` services) so it
does not share credentials with the main zerotrust database.

---

## PostHog (self-hosted)

PostHog is **not** embedded in `docker-compose.platform.yml` because upstream
maintains a 20+ service hobby stack with repo-local volume mounts and image
builds. zerotrust uses the **official hobby deploy script** instead.

### Start

```bash
./scripts/ops/posthog-hobby.sh
# or with a custom domain:
POSTHOG_DOMAIN=analytics.localhost ./scripts/ops/posthog-hobby.sh --domain analytics.localhost
```

Files land in `infra/posthog/`. See `infra/posthog/env.example` for env inventory.

### Requirements

PostHog is **not** part of `docker-compose.platform.yml` — run it as a separate
Compose project via the official hobby script (~20 services, local volume mounts).

| Resource | Guidance |
| --- | --- |
| **RAM** | **16 GB recommended** (8 GB minimum for light evaluation) |
| **Disk** | **30+ GB** free for images, ClickHouse, Postgres, and Kafka data |
| **Deploy** | Separate from zerotrust compose — `./scripts/ops/posthog-hobby.sh` |
| **Time** | First pull can take several minutes |

Do not co-locate PostHog on the same host as production zerotrust unless the
machine meets the RAM/disk budget above.

### zerotrust integration

1. Create a PostHog project and copy the project API key.
2. Add to `packages/ui/.env.local`:

   ```env
   NEXT_PUBLIC_POSTHOG_KEY=<project-api-key>
   NEXT_PUBLIC_POSTHOG_HOST=http://localhost
   ```

3. `AnalyticsScript.tsx` loads PostHog **only after cookie consent is accepted**
   (same pattern as Plausible/GA) when `NEXT_PUBLIC_POSTHOG_KEY` and
   `NEXT_PUBLIC_POSTHOG_HOST` are set.
4. For sensitive server-side events, use PostHog's HTTP capture API from the Hono
   API — never include tokens or PII in URLs (CWE-532).

---

## HashiCorp Vault

Optional secrets backend for teams that need Vault specifically (dynamic DB creds,
Transit, PKI) or already operate a HashiCorp stack. zerotrust reads configuration
from **environment variables** at boot (`src/config/env.ts`) — inject secrets from
Vault at deploy time; no in-app SDK is required on day one.

For Infisical vs Vault trade-offs, see
[`comparisons/secrets-infisical-vs-vault.md`](../comparisons/secrets-infisical-vs-vault.md).

### Start (local dev mode)

The platform overlay runs Vault in **dev mode**: in-memory storage, auto-unsealed,
single root token. Suitable for local evaluation only — **never use dev mode in
production**.

```bash
docker compose -f docker-compose.yml -f docker-compose.platform.yml up -d vault
```

Default URL: **http://localhost:8200**  
Default root token: value of `VAULT_DEV_ROOT_TOKEN` (compose default `dev-root-token`).

Verify:

```bash
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=dev-root-token   # or your VAULT_DEV_ROOT_TOKEN
vault status
```

Open the UI at http://localhost:8200/ui and sign in with the root token.

### Bootstrap KV for zerotrust

Enable a KV v2 mount and seed paths that mirror `.env.example` keys:

```bash
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=dev-root-token

vault secrets enable -path=zerotrust kv-v2

# One path per environment + surface (api, ui build, worker)
vault kv put zerotrust/dev/api \
  TOKEN_SECRET_HEX="$(openssl rand -hex 32)" \
  CSFLE_MASTER_KEY_HEX="$(openssl rand -hex 32)" \
  DATABASE_URL=postgresql://zerotrust:password@localhost:5432/zerotrust \
  REDIS_URI=redis://localhost:6379

vault kv put zerotrust/dev/ui \
  NEXT_PUBLIC_POSTHOG_KEY= \
  NEXT_PUBLIC_POSTHOG_HOST=http://localhost
```

Suggested path layout:

| Path | Contents |
| --- | --- |
| `zerotrust/dev/api` | API `.env` keys (`TOKEN_SECRET_HEX`, `DATABASE_URL`, `STRIPE_*`, …) |
| `zerotrust/staging/api` | Staging API secrets |
| `zerotrust/prod/api` | Production API secrets |
| `zerotrust/prod/ui` | UI build-time / server secrets (`packages/ui/.env.local` mirror) |

### Inject secrets into zerotrust

**Option A — deploy-time export (simplest):**

```bash
vault kv get -format=json zerotrust/dev/api \
  | jq -r '.data.data | to_entries[] | "\(.key)=\(.value)"' > .env.vault
set -a && source .env.vault && set +a && bun dev
```

**Option B — Vault Agent** renders an env file before `docker compose up` (production
pattern). Bind an AppRole or Kubernetes auth role to read only `zerotrust/prod/api`.

**Option C — CI/CD (GitHub Actions):** JWT/OIDC auth → short-lived token → read KV →
export as job env (same keys as `.env.example`).

Priority secrets to migrate first: `TOKEN_SECRET_HEX`, `CSFLE_MASTER_KEY_HEX`,
`DATABASE_URL`, `REDIS_URI`, `METRICS_AUTH_TOKEN`, Stripe/OAuth keys.

### Init, unseal, and production

| Mode | Storage | Unseal | Use |
| --- | --- | --- | --- |
| **Dev** (`server -dev`) | In-memory | Auto | Local evaluation only |
| **Single-node file** | `file` backend + volume | Manual Shamir keys | Staging / small prod |
| **HA Raft** | Integrated storage (3+ nodes) | Shamir or KMS auto-unseal | Regulated production |

Production checklist:

1. Run `vault operator init` once; store unseal keys and initial root token offline.
2. Unseal each node after restart (`vault operator unseal`).
3. Revoke/limit the root token; use AppRole, Kubernetes auth, or OIDC for apps.
4. Enable TLS (`tls_disable = 0`) and place Vault behind a reverse proxy.
5. Enable audit devices (`file` or `socket`) for SOC 2 access evidence.
6. Back up the storage volume (`docs/compliance/backup-restore-runbook.md`).

The compose overlay does **not** ship a production Vault cluster — deploy HA Vault
per [HashiCorp production hardening](https://developer.hashicorp.com/vault/tutorials/operations/production-hardening)
on dedicated infrastructure, then point deploy scripts at that `VAULT_ADDR`.

### Dynamic database credentials (advanced)

Vault can mint short-lived Postgres users instead of static `DATABASE_URL` passwords.
Requires the [database secrets engine](https://developer.hashicorp.com/vault/docs/secrets/databases)
configured against your zerotrust Postgres role. zerotrust does not hot-reload
`DATABASE_URL` today — use dynamic creds with connection pooling that refreshes on
lease expiry, or treat this as a future `src/config` enhancement.

---

## Production hardening

Use the example prod overlays — they fail fast when required secrets are missing
instead of falling back to dev defaults.

### Platform overlay

```bash
export OPENSEARCH_ADMIN_PASSWORD='…'   # OpenSearch admin (security plugin on)
export GLITCHTIP_SECRET_KEY="$(openssl rand -hex 32)"
export GLITCHTIP_POSTGRES_PASSWORD='…'

docker compose \
  -f docker-compose.yml \
  -f docker-compose.platform.yml \
  -f docker-compose.platform.prod.example.yml \
  up -d
```

| Service | Dev default | Prod overlay / action |
| --- | --- | --- |
| **OpenSearch** | Security plugin disabled | `DISABLE_SECURITY_PLUGIN=false`, `OPENSEARCH_INITIAL_ADMIN_PASSWORD` required; terminate **TLS at reverse proxy** before exposing `:9201` / `:5602` publicly |
| **GlitchTip** | Open registration | `ENABLE_USER_REGISTRATION=false`, `ENABLE_ORGANIZATION_CREATION=false`; strong `GLITCHTIP_SECRET_KEY` |
| **Uptime Kuma** | No auth on first setup | Create admin account immediately |
| **Vault** | Dev mode, default root token | HA Raft + KMS auto-unseal, TLS, audit devices (not in compose) |
| **PostHog** | Hobby TLS via Caddy | Real domain, backup ClickHouse + Postgres; **separate host** if RAM-constrained |

When OpenSearch security is enabled, point zerotrust at HTTPS with basic auth or
configure index-level roles; update `ELASTICSEARCH_*` credentials accordingly.

### Observability overlay

```bash
export GRAFANA_ADMIN_PASSWORD='…'   # required — never admin/admin in production
export METRICS_AUTH_TOKEN='…'       # same value on zerotrust API

cp monitoring/metrics-token.example monitoring/metrics-token
# Uncomment authorization block in monitoring/prometheus.yml (OPS-1)

docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  -f docker-compose.observability.prod.example.yml \
  up -d
```

| Service | Dev default | Prod overlay / action |
| --- | --- | --- |
| **Grafana** | `admin` / `admin` | `GRAFANA_ADMIN_PASSWORD` **required** by prod overlay; sign-up and anonymous auth disabled |
| **`/metrics`** | Open in dev | `METRICS_AUTH_TOKEN` on API + Prometheus Bearer scrape |
| **Promtail** | Optional `--profile logs` | Run on Linux or Docker Desktop WSL2; use Alloy/Fluent Bit on Windows native |

Persistent volumes are declared in each compose file. Back them up with your
standard volume snapshot strategy (`docs/compliance/backup-restore-runbook.md`).

---

## Production notes (quick reference)

| Service | Local dev default | Production action |
| --- | --- | --- |
| OpenSearch | Security disabled | Enable security plugin, TLS, role-based access — see prod overlay above |
| Grafana | `admin` / `admin` | Change `GRAFANA_ADMIN_PASSWORD`, disable anonymous auth |
| GlitchTip | Random-default `SECRET_KEY` | Set `GLITCHTIP_SECRET_KEY`, restrict registration |
| Uptime Kuma | No auth on first setup | Create admin account immediately |
| PostHog | Hobby TLS via Caddy | Use real domain, backup ClickHouse + Postgres; ~16 GB RAM / ~30 GB disk |
| Vault | Dev mode, default root token | HA Raft + KMS auto-unseal, TLS, audit devices |
| `/metrics` | Open in dev | `METRICS_AUTH_TOKEN` required in production |

---

## Related docs

- [`deployment.md`](../deployment.md) — Docker Compose core stack, OPS-1 metrics auth
- [`oss.md`](../../oss.md) — OSS tool shortlist and effort estimates
- [`production-checklist.md`](../production-checklist.md) — pre-launch observability sign-off
