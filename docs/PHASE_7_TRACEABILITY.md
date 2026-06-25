# Phase 7 — Traceability and Request Correlation

Date: 2026-06-25  
Goal: make request correlation and OpenTelemetry startup active in the runnable API server.

## Implemented in this phase

| Workstream | Deliverable | Exit criterion |
|---|---|---|
| OpenTelemetry startup | `createServer()` now calls `initTelemetry()` alongside Sentry initialization. | OTLP tracing can be enabled with environment variables without custom bootstrap code. |
| Request correlation | `telemetryMiddleware()` is mounted globally, adding `X-Trace-Id` to API responses. | Operators can correlate client errors, logs, and traces by trace id. |
| Ops smoke coverage | `scripts/ops-smoke.mjs` now requires `/health` to return `X-Trace-Id`. | Staging smoke validation catches missing request-correlation middleware. |

## Environment variables

- `OTEL_ENABLED=false` disables OpenTelemetry startup.
- `OTEL_EXPORTER_OTLP_ENDPOINT` points at the collector base URL, for example `http://otel-collector:4318`.
- `OTEL_SERVICE_NAME` overrides the default service name.

## Staging validation

```bash
API_URL=<staging-api> bun run ops:smoke
curl -I <staging-api>/health | grep -i x-trace-id
```
