# Platform infrastructure stack

Operator guide for optional self-hosted services that pair with zerotrust:
OpenSearch, Uptime Kuma, PostHog, Grafana (full observability), and GlitchTip.

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

- Security plugin is disabled for local dev only. Enable TLS and fine-grained
  access control before any internet-facing deploy.
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

### zerotrust integration

**Metrics** — set `METRICS_AUTH_TOKEN` in production and uncomment the Bearer
block in `monitoring/prometheus.yml` (see [`deployment.md`](../deployment.md) § OPS-1).

**Traces** — point OpenTelemetry at Tempo:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 bun dev
```

The API exporter is configured in `src/telemetry/tracer.ts`. When Tempo and Jaeger
both expose `:4318`, run only one trace backend at a time.

**Logs** — enable Promtail on Linux or Docker Desktop with socket access:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile logs up -d promtail
```

On Windows without Docker socket access, query Loki manually or ship logs via
your production log agent (Alloy, Fluent Bit, etc.).

---

## GlitchTip (Sentry-compatible)

Self-hosted error tracking compatible with zerotrust's existing Sentry SDK wiring.

### Start

```bash
# Generate a secret first (do not use the compose default in production)
export GLITCHTIP_SECRET_KEY="$(openssl rand -hex 32)"
docker compose -f docker-compose.yml -f docker-compose.platform.yml up -d glitchtip-web glitchtip-worker
```

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

- **RAM:** 16 GB recommended (8 GB minimum for light evaluation)
- **Disk:** 30+ GB free for images and data
- **Time:** first pull can take several minutes

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

## Secrets management

For Infisical vs HashiCorp Vault comparison and a recommendation for this stack,
see [`comparisons/secrets-infisical-vs-vault.md`](../comparisons/secrets-infisical-vs-vault.md).

---

## Production notes

| Service | Local dev default | Production action |
| --- | --- | --- |
| OpenSearch | Security disabled | Enable security plugin, TLS, role-based access |
| Grafana | `admin` / `admin` | Change `GRAFANA_ADMIN_PASSWORD`, disable anonymous auth |
| GlitchTip | Random-default `SECRET_KEY` | Set `GLITCHTIP_SECRET_KEY`, restrict registration |
| Uptime Kuma | No auth on first setup | Create admin account immediately |
| PostHog | Hobby TLS via Caddy | Use real domain, backup ClickHouse + Postgres |
| `/metrics` | Open in dev | `METRICS_AUTH_TOKEN` required in production |

Persistent volumes are declared in each compose file. Back them up with your
standard volume snapshot strategy (`docs/compliance/backup-restore-runbook.md`).

---

## Related docs

- [`deployment.md`](../deployment.md) — Docker Compose core stack, OPS-1 metrics auth
- [`oss.md`](../../oss.md) — OSS tool shortlist and effort estimates
- [`production-checklist.md`](../production-checklist.md) — pre-launch observability sign-off
