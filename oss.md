# Open-source (self-hosted) tools to pair with zerotrust

This doc is an operator-focused shortlist of **self-hosted OSS tools** that pair well with the zerotrust SaaS starter. The goal is pragmatic: pick a small, reliable stack that improves **observability, incident response, and operations** without fighting the template.

## Already in zerotrust

zerotrust already includes integration hooks for common OSS-friendly infrastructure:

- **Prometheus metrics**: `/metrics` endpoint with Bearer token gating via `METRICS_AUTH_TOKEN` (required in prod). See `docs/deployment.md` (Metrics auth verification), plus `monitoring/prometheus.yml` and `docker-compose.observability.yml`.
- **OpenTelemetry tracing**: OTLP HTTP exporter wiring in `src/telemetry/tracer.ts` (env-driven; defaults to `http://localhost:4318`). See `docker-compose.tracing.yml`.
- **Sentry hooks (server + UI)**: enable by setting `SENTRY_DSN`. Config lives in `src/instrument.ts` and `packages/ui/sentry.*.config.ts` (also see `packages/ui/next.config.ts`).
- **Elasticsearch (optional)**: controlled by `ELASTICSEARCH_ENABLED` with host/port/index prefix config. See `docs/deployment.md` (Elasticsearch section) and `.env.example`.
- **SMTP email**: Nodemailer settings in `.env.example` (`MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`).
- **Webhooks**: generic webhook/event plumbing exists (see `src/webhooks/` usage across the API); email-provider webhook auth can be gated with `EMAIL_WEBHOOK_SECRET` (header `X-Webhook-Secret`).
- **Consent-gated analytics script**: the UI ships a consent-aware loader at `packages/ui/src/components/AnalyticsScript.tsx` (currently supports Plausible + Google Analytics via `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` / `NEXT_PUBLIC_GA_MEASUREMENT_ID`).

## Recommended self-hosted OSS stack

Pick a minimal subset first (metrics + dashboards + tracing + uptime + analytics). Each item includes a suggested effort level for this template.

### Observability (metrics · logs · traces)

#### Prometheus
- **Description**: Time-series metrics collection and alert rule evaluation.
- **Why for this template**: zerotrust already exposes Prometheus-format metrics, and the repo includes Prometheus config examples.
- **Integration notes**: Set `METRICS_AUTH_TOKEN` (prod requires it). Reference `docs/deployment.md` and `monitoring/prometheus.yml` (token-gated scrape guidance).
- **Effort**: **Drop-in**

#### Grafana
- **Description**: Dashboards and alerting UI for metrics/logs/traces.
- **Why for this template**: One pane to monitor API latency/error rates, auth/MFA events, and queue health once you wire data sources.
- **Integration notes**: Grafana + Loki + Tempo ship in `docker-compose.observability.yml` (Grafana on `:3003`). See [`docs/infra/README.md`](./docs/infra/README.md).
- **Effort**: **Low**

#### Alertmanager
- **Description**: Routes Prometheus alerts to on-call systems (Slack/PagerDuty/etc.).
- **Why for this template**: The repo ships SLO-style alert rules and an operator runbook for verifying alert plumbing.
- **Integration notes**: See `docs/deployment.md` (OBS-1) and the example config `monitoring/alertmanager.production.example.yml`. Validate with `bun run ops:verify-alerting`.
- **Effort**: **Low**

#### Grafana Loki (optional)
- **Description**: Log aggregation optimized for cheap storage + label-based queries.
- **Why for this template**: zerotrust logs structured JSON to stdout; Loki is an easy “central logs” default when you don’t want full ELK/OpenSearch.
- **Integration notes**: Ship container/service logs to Loki (e.g., Promtail/Alloy). Keep labels low-cardinality; do not label on user identifiers.
- **Effort**: **Medium**

#### Grafana Tempo _or_ Jaeger (pick one)
- **Description**: Distributed tracing backend (Tempo stores traces cheaply; Jaeger is a classic tracing UI/back end).
- **Why for this template**: zerotrust already exports OTLP traces; you just need a collector/backend to receive them.
- **Integration notes**: Configure `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME`. Code: `src/telemetry/tracer.ts`. Local compose: `docker-compose.tracing.yml`.
- **Effort**: **Low**

### Error tracking

#### GlitchTip (OSS Sentry alternative)
- **Description**: Sentry-compatible error/event tracking you can self-host.
- **Why for this template**: zerotrust supports Sentry DSN wiring already; GlitchTip can often be a drop-in DSN replacement for teams that want OSS-only.
- **Integration notes**: Set `SENTRY_DSN` (server-side) and ensure the UI build has the expected Sentry wiring (see `packages/ui/sentry.*.config.ts` and `src/instrument.ts`).
- **Effort**: **Drop-in**

### Product analytics (consent-aware)

#### Umami
- **Description**: Lightweight, self-hosted web analytics with a simple script embed.
- **Why for this template**: Pairs well with zerotrust’s consent-gated loader pattern and keeps ops overhead low.
- **Integration notes**: Use the consent gate in `packages/ui/src/components/AnalyticsScript.tsx` as the single place to load analytics. Replace/add an Umami script there (keeping the “only load after consent accepted” behavior).
- **Effort**: **Medium**

#### PostHog (self-hosted)
- **Description**: Product analytics + event capture + feature flags (heavier than Umami).
- **Why for this template**: If you want funnels, cohorts, and event-based retention, PostHog is the OSS workhorse.
- **Integration notes**: Official hobby deploy via `./scripts/ops/posthog-hobby.sh` (see [`docs/infra/README.md`](./docs/infra/README.md)). **Separate from zerotrust compose** — plan for **~16 GB RAM** and **~30 GB disk**. Load the snippet from `packages/ui/src/components/AnalyticsScript.tsx` (consent gate). Prefer server-to-server event ingestion for sensitive events; do not send secrets/tokens in URLs.
- **Effort**: **Medium**

### Uptime & status

#### Uptime Kuma
- **Description**: Simple uptime monitoring with notifications and a basic status page.
- **Why for this template**: Great “first monitor” for `/health`, `/version`, and (auth-gated) `/metrics` without a big observability platform.
- **Integration notes**: Ships in `docker-compose.platform.yml` on `:3002`. Monitor `/health`, `/version`, and UI `/api/deploy-config` per `docs/deployment.md` smoke steps (`ops:smoke`).
- **Effort**: **Low**

#### Cachet (or similar OSS status page)
- **Description**: Public-facing incident/status page.
- **Why for this template**: Helps you operationalize downtime communication early, which matters for any SaaS starter.
- **Integration notes**: Link incident runbooks under `docs/compliance/` (where applicable) and keep status comms separate from internal alerting.
- **Effort**: **Medium**

### Security & secrets

#### HashiCorp Vault
- **Description**: Central secret storage with audit trails and short-lived credentials.
- **Why for this template**: zerotrust has many operational secrets (DB creds, `TOKEN_SECRET_HEX`, `CSFLE_MASTER_KEY_HEX`, SMTP creds, `METRICS_AUTH_TOKEN`, etc.); Vault reduces “secret sprawl”.
- **Integration notes**: Local dev via `docker compose -f docker-compose.yml -f docker-compose.platform.yml up -d vault` (http://localhost:8200). Move high-impact secrets from `.env` to KV and inject at deploy. See [`docs/infra/README.md`](./docs/infra/README.md) § HashiCorp Vault and [`docs/comparisons/secrets-infisical-vs-vault.md`](./docs/comparisons/secrets-infisical-vs-vault.md).
- **Effort**: **Medium**

#### Infisical (OSS secrets manager)
- **Description**: Developer-friendly secret manager with a smoother UX than Vault for many teams.
- **Why for this template**: Quick win for teams that want “managed-feeling” secret workflows while staying self-hosted.
- **Integration notes**: Map `.env.example` keys to Infisical environments and inject at deploy. Comparison with Vault: [`docs/comparisons/secrets-infisical-vs-vault.md`](./docs/comparisons/secrets-infisical-vs-vault.md).
- **Effort**: **Low**

### Search & audit (only if you need it)

#### OpenSearch (alternative to Elasticsearch)
- **Description**: Elasticsearch-compatible search/log/audit stack (community fork).
- **Why for this template**: If you want a self-hosted ELK-like workflow but prefer an OSS-leaning distribution, OpenSearch is often the default choice.
- **Integration notes**: Ships in `docker-compose.platform.yml` (API `:9201`, Dashboards `:5602`). Set `ELASTICSEARCH_ENABLED=true` and `ELASTICSEARCH_PORT=9201`. See [`docs/infra/README.md`](./docs/infra/README.md).
- **Effort**: **Medium**

## Skip for this template

These tools are common, but are usually a mismatch (or redundant) for this starter:

- **Keycloak / Authentik**: Great IdPs, but redundant if you’re using zerotrust as the primary auth app; they add another auth plane to operate and explain.
- **Plausible / Matomo**: License constraints and/or operational heft can be a poor fit early on. If you want OSS analytics with low friction, prefer Umami; if you need event analytics, prefer PostHog.
- **Wazuh**: Powerful host/SIEM tooling, but typically overkill for a small self-hosted SaaS starter unless you already run a full security operations pipeline.

## Next steps (operator checklist)

- [ ] **Decide analytics**: keep it minimal (Umami) or go event-driven (PostHog). Keep consent-gating centralized in `packages/ui/src/components/AnalyticsScript.tsx`.
- [ ] **Choose observability baseline**: Prometheus + Grafana + Alertmanager, then add Loki/Tempo only if you need logs/traces at scale.
- [ ] **Set up a status page**: Uptime Kuma for monitors + an OSS status page (e.g., Cachet) for external comms.
- [ ] **Harden email early**: configure SMTP via `.env.example` vars (`MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`) and test transactional email flows.
- [ ] **Lock down `/metrics` in production**: set `METRICS_AUTH_TOKEN` and verify 401-without-token / 200-with-token per `docs/deployment.md`.

---

Compose overlays and operator docs:

- **`docker-compose.platform.yml`** — OpenSearch, Uptime Kuma, GlitchTip
- **`docker-compose.platform.prod.example.yml`** — production hardening for platform overlay
- **`docker-compose.observability.yml`** — Prometheus, Alertmanager, Grafana, Loki, Tempo
- **`docker-compose.observability.prod.example.yml`** — Grafana password + metrics token mount
- **`scripts/ops/posthog-hobby.sh`** — official PostHog hobby deploy
- **`docs/infra/README.md`** — ports, integration steps, production notes
- **`docs/comparisons/secrets-infisical-vs-vault.md`** — secrets manager comparison

If you want, we can also add a `docker-compose.oss.yml` that bundles the recommended stack for local demo deployments.
