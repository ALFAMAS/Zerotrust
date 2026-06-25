# Phase 9 — Alerting and SLO Evidence

Date: 2026-06-25  
Goal: make Prometheus alerting concrete and runnable for staging validation.

## Implemented in this phase

| Workstream | Deliverable | Exit criterion |
|---|---|---|
| Prometheus scrape config | `monitoring/prometheus.yml` scrapes the API `/metrics` endpoint. | Staging/local Prometheus can ingest API metrics without hand-written config. |
| SLO alert rules | `monitoring/alerts.yml` defines error-rate, p95 latency, and missing-scrape alerts. | p95 >100ms, 5xx >1%, and scrape failures produce actionable alerts. |
| Local observability stack | `docker-compose.observability.yml` runs Prometheus and Alertmanager with the repo config. | Humans can validate alerts before promoting to managed monitoring. |

## Validation commands

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d prometheus alertmanager
curl -sf http://localhost:9090/-/ready
curl -sf http://localhost:9090/api/v1/rules
```

## Human operating notes

1. Route Alertmanager receivers to Slack/Teams/PagerDuty in staging secrets before sign-off.
2. Keep p95 latency alert at 100ms for auth/org endpoints; tune route labels only after staging evidence shows noise.
3. Export Prometheus rule evaluation screenshots or API output into compliance evidence each release.
