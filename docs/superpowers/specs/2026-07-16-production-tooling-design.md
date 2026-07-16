# Production tooling design

## Queue dashboard

Mount Bull Board at `/admin/queues` behind `authMiddleware` and `requireAdmin`. It is enabled automatically outside production and only with `QUEUE_DASHBOARD_ENABLED=true` in production. The dashboard connects to the email, scheduled-job, and Stripe webhook queues using one canonical Redis URI parser and exposes Bull Board's standard retry/promote/remove actions. It does not add custom bulk-clean actions.

## Logging

Keep the public `getLogger()`, child/context, audit, Elasticsearch, and SIEM behavior stable while replacing manual console serialization and level filtering with Pino. Apply Pino path redaction before output and retain `redactLogEntry()` as defense in depth. Production emits JSON to stdout; local interactive development uses the dev-only `pino-pretty` transport.

## Hermetic integration tests

Add dedicated integration commands that start one pinned PostgreSQL container and one pinned Redis container per Vitest run. The setup exports container connection URLs before test modules load and tears both down after the suite. Unit tests remain Docker-free, existing CI service containers remain unchanged, and a missing Docker runtime fails with a direct remediation message.

## Email preview

Add the React Email CLI as a development dependency and an `email:dev` script pointed at a preview-only `emails/` directory. Nine thin preview entries reuse the production templates and provide synthetic, non-secret `PreviewProps`; shared production components live in an ignored `_components` path where needed.

## Configuration and security

`QUEUE_DASHBOARD_ENABLED` is a validated boolean string and documented as a production opt-in. Queue routes never weaken the admin boundary. Redis credentials are parsed centrally and never logged. Pino redaction paths are static, never request-controlled.
