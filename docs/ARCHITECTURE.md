# Architecture

Audited 2026-07-04. Describes the system as it is today, then records shipped
upgrades. Short-term audit backlog is shipped — see [`../tdone.md`](../tdone.md); five
long-term items remain in [`../todo.md`](../todo.md). Standing audit:
[`AUDIT.md`](./AUDIT.md).

## 1. Overview

zerotrust is a **Bun monorepo** with three deployables:

| Package            | What it is                                                              | Port |
| ------------------ | ----------------------------------------------------------------------- | ---- |
| `src/`             | Hono + TypeScript HTTP API                                              | 1337 |
| `packages/ui/`     | Next.js 16 (App Router, React 19) dashboard/admin/landing               | 3000 |
| `packages/client/` | Generated, dependency-free TypeScript SDK (from `src/api/openapi.json`) | —    |

It is a **modular monolith**: one API process exposes ~26 route modules backed
by ~45 services and ~21 middleware, persisting to PostgreSQL (40 tables) with
Redis for sessions/rate-limiting/queue. There are no internal network hops
between domains — modules call each other in-process.

```
┌────────────────────────────┐         ┌──────────────────────────────┐
│  Next.js app (port 3000)    │  HTTPS  │   Hono API (port 1337)        │
│  landing · dashboard ·      │ ──────▶ │   src/api/server.ts           │
│  admin · PWA · SDK client   │         │   middleware → routes →        │
└────────────────────────────┘         │   services → db/redis/s3       │
                                        └───────────────┬───────────────┘
                  ┌──────────────────────┬──────────────┼───────────────┬─────────────────┐
                  ▼                      ▼              ▼               ▼                 ▼
            PostgreSQL (5432)      Redis (6379)    Elasticsearch    S3-compatible    SMTP / Stripe /
            Drizzle ORM            sessions·rate   (9200, optional) (backups·uploads) SMTP / web-push
            41 tables              limit·BullMQ    audit·search                       (external)
```

## 2. Request lifecycle

Global middleware runs in this order (`src/api/server.ts`), then per-route
guards:

1. `cors` → `secureHeaders` → `compress`
2. `metricsMiddleware` (Prometheus timing) → `telemetryMiddleware` (OpenTelemetry span)
3. `apiVersioning` (negotiates `/api/versions`)
4. `alertingMiddleware` → `sloAlertingMiddleware` (error-rate / latency burn signals)
5. Static `/uploads/*`
6. **Route module**, which applies its own guards from `src/middleware/`:
   `authMiddleware` (PASETO verify) or `apiKeyAuth`, then as needed
   `rateLimiting`, `requirePlan`, `requireAdmin`, `inferredCountry`,
   `continuousVerification`, `tokenBinding`, `deviceAttestation`, `sessionControl`.

Auth resolves a `user` (and optional `apiKey`) onto the Hono context; handlers
read it via `c.get("user")`.

### Multi-tenancy boundary

**Organizations are the sole tenancy boundary** (ARCH-1, 2026-07-04). The
orphaned `tenants` table and `/admin/tenants` routes were removed. Org-scoped
data uses `org_id` / `orgId` UUID FKs to `organizations`. Cross-tenant JIT
requests reference `requestor_org_id` and `target_org_id` (MT-2). CI lint
(`bun run org-scoping:check`, MT-1) scans route/store code for missing org
predicates on org-scoped tables.

## 3. Module map (`src/`)

| Area          | Dir(s)                                                                    | Responsibility                                                                                          |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| HTTP          | `api/`                                                                    | Hono app, route mounting, OpenAPI spec                                                                  |
| Domain logic  | `services/{auth,billing,notifications,compliance,ops,shared}/` (48 files) | token, session, email/queue, billing, wallet, globalization, search, compliance, backup, SLO, alerting… |
| Middleware    | `middleware/` (~20)                                                       | auth, rate limiting, CSRF/headers, plan gating, abuse defense, API versioning                           |
| Data          | `db/`                                                                     | Drizzle schema (40 tables) + connection; `models/` thin table re-exports                                |
| Crypto        | `crypto/`                                                                 | `paseto-v4` (v4.local), `csfle` (field encryption), `hardware-key-store`, `codes`                       |
| MFA           | `mfa/`                                                                    | TOTP, Email OTP channel, FIDO MDS3                                                                      |
| OAuth         | `oauth/`                                                                  | provider factory + adapters (Google/GitHub/Facebook; Apple Sign In not yet implemented)                 |
| Access        | `jit/`                                                                    | cross-tenant just-in-time elevation                                                                     |
| Platform      | `audit/` `metrics/` `telemetry/` `webhooks/` `notifications/` `ssf/`      | hash-chained audit log, Prometheus, OTel, outbound webhooks, SSF receiver                               |
| Cross-cutting | `shared/` `config/` `logger/` `templates/`                                | safe-fetch/redirect guards, typed config, structured logging, email templates                           |

## 4. State & data

- **PostgreSQL** (Drizzle ORM, `postgres` driver) — system of record, 40 tables,
  35 versioned migrations in `drizzle/` (including org RLS policies in `0035`). Sensitive columns use **CSFLE**
  (client-side field encryption) with key-version rotation.
- **Redis** (ioredis) — session validation cache (`session:{tokenId}` with
  debounced `lastActivityAt` writes and **DB fallback when Redis is down**),
  sliding-window rate limiting (`rateLimiter/redis.ts`, with `inmemory.ts`
  fallback), and the **BullMQ** email queue.
- **Elasticsearch** (optional, off by default) — full-text search mirror + audit/log
  streaming for large tenants. Search and audit work without ES via Postgres FTS and
  the tamper-evident hash-chain; set `ELASTICSEARCH_ENABLED=true` to opt in.
- **S3-compatible storage** (AWS S3 / B2 / R2 / MinIO / Wasabi) — one adapter for
  `pg_dump` backups (`backups/`) and user uploads (`uploads/`), with local-disk
  fallback.

## 5. Auth & crypto

- **Access tokens:** PASETO **v4.local** (XChaCha20 + keyed BLAKE2b/PAE),
  1-hour TTL, signed with `TOKEN_SECRET_HEX`. No JWT.
- **Refresh tokens:** opaque random strings, **SHA-256-hashed at rest**, rotated
  on every use; carry no claims.
- **Sessions:** Redis-cached, DB-backed; list/revoke, device fingerprinting,
  concurrent-session caps.
- **At rest:** CSFLE for sensitive columns; bcrypt password hashing; a
  hardware-key-store abstraction (software provider default).
- **Abuse defense:** per-account lockout, per-IP credential-stuffing throttle,
  HaveIBeenPwned breach checks, optional signup proof-of-work.
- **Egress safety:** all user-influenced server fetches go through
  `assertSafeFetchHost`/`assertSafeFetchUrl` (CWE-918 guard); redirects through
  `safeRelativeRedirect` (CWE-601). See the table in [`CLAUDE.md`](../CLAUDE.md).

## 6. Background work

Owned by the dedicated worker (`src/worker.ts`) in production (`WORKER_MODE=true`
on API replicas); started in-process by `startServer()` only for local dev /
single-process deploys:

- **BullMQ email queue** consumer (when `REDIS_URI` is set).
- **BullMQ Stripe webhook queue** consumer.
- **BullMQ job scheduler** (`src/jobs/scheduler.ts`, `Queue.upsertJobScheduler`)
  for cron-style jobs (24h): data retention purge, notification email
  fallback, billing lifecycle (trial/dunning/win-back), `pg_dump` backup,
  audit anchoring — with retry/exponential-backoff and dead-letter visibility
  (`getFailedScheduledJobs()`).

Worker/scheduler split and queue-backed cron scheduling are **shipped** — see
[`deployment.md`](./deployment.md) §Production background-worker topology and
§Queue-backed cron scheduling.

## 7. Observability & ops

- **Metrics:** `prom-client` at `/metrics` (auth-gated); per-request timing
  middleware.
- **Tracing:** OpenTelemetry SDK + auto-instrumentation, OTLP/HTTP exporter.
- **Errors:** Sentry (`@sentry/node`, browser DSN on the UI).
- **SLO:** `slo.service` computes burn-rate; `/admin/slo` surfaces it.
- **Health:** `/health`, `/healthz`, public `/status` (+ SSE `/status/stream`).
- **Audit:** SHA-256 hash-chained, tamper-evident, optional ES + SIEM fan-out.

## 8. Frontend

Next.js 16 App Router (React 19, Tailwind + shadcn/ui, next-intl EN/ES/FR/AR
with RTL, PWA/VAPID). Talks to the API through `packages/ui/src/lib` (auth-token
client), TanStack Query server-state modules, and the generated SDK. Ten
high-traffic routes prefetch via RSC `HydrationBoundary` (see
[`ui-http-client.md`](./ui-http-client.md)); remaining data pages hydrate from
client-side TanStack Query. A built-in Next.js MCP dev server is exposed at
`/_next/mcp` for coding agents.

---

## Proposed upgrades (all shipped)

| #      | Change                                                                       | Why                                                                                                                   | Effort                                                          |
| ------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **P1** | Split HTTP and worker/scheduler processes (or instance-guard the schedulers) | **Correctness** — duplicate jobs under cluster mode                                                                   | **Shipped** (P1.2, P1.5)                                        |
| P2     | Adopt expand/contract migrations; gate destructive DDL                       | Safe rollbacks; the `0020`–`0024` drops are irreversible                                                              | **Shipped** (P3.5) — CI destructive-migration gate              |
| P3     | Make Elasticsearch fully optional / default to Postgres FTS                  | Drop an operational dependency post-slim-down                                                                         | **Shipped** (2026-07-03)                                        |
| P4     | Move hot dashboard reads to Server Components / route handlers               | TTFB, fewer client waterfalls                                                                                         | **Shipped** (P3.4 pilot + P3.6 + P3.11 — ten prefetched routes) |
| P5     | Containerize (Dockerfile + compose) and split health/readiness               | Reproducible deploys, orchestrator-friendly                                                                           | **Shipped** — Dockerfile + `docker-compose.yml` + readiness     |
| P6     | Fail-fast typed config validation at boot                                    | Catch missing prod secrets before serving traffic                                                                     | **Shipped** (P4.3)                                              |
| P7     | Group `services/` by domain                                                  | **Shipped 2026-07-03** — files live under `auth/`, `billing/`, `notifications/`, `compliance/`, `ops/`, and `shared/` | Done                                                            |

### P1 — Separate the worker from the API process (correctness) — **Shipped** (P1.2, P1.5)

Production deploy blueprints default API replicas to `WORKER_MODE=true` and run
exactly one dedicated worker (`bun run src/worker.ts` / `dist/worker.js`). See
[`docs/deployment.md`](./deployment.md) §Production background-worker topology
and [`docs/reference-architecture.md`](./reference-architecture.md).

~~`startServer()` unconditionally calls schedulers in every PM2 cluster worker.~~
Extracted `src/worker.ts` owns BullMQ consumers and cron schedulers; API scales
horizontally and defers background work when `WORKER_MODE=true`.

### P2 — Migration safety — **Shipped** (P3.5)

41 tables / 28 migrations, several recent ones `DROP … CASCADE`. CI now flags
`DROP`/`ALTER … DROP` in new migrations via `scripts/check-destructive-migrations.ts`
and `.destructive-migrations.json` (`migrations:check` job + pre-commit).
Expand/contract discipline remains the operator runbook for irreversible DDL.

### P3 — Reconsider Elasticsearch — shipped 2026-07-03

After removing collaboration/notes, the searchable surface is just
user/org/ticket and the service already has a Postgres fallback. For most
deployments a Postgres `tsvector` + GIN index covers this without running ES.
ES is opt-in for large tenants (`ELASTICSEARCH_ENABLED=true`); default off to
shed an operational dependency — consistent with the slim-down's goal.

### P4 — Server-side data fetching on the dashboard — **Shipped** (P3.4 + P3.6 + P3.11)

Ten high-traffic dashboard/admin pages prefetch authenticated reads server-side
via `serverApiClient` + TanStack Query `HydrationBoundary` (see
[`ui-http-client.md`](./ui-http-client.md)). Client components (`*Client.tsx`)
share query keys with prefetch — no duplicate fetch on hydration.

### P5 — Containerized, orchestrator-friendly deploys — **Shipped**

The repo ships a multi-stage `Dockerfile` (API + worker targets) and
`docker-compose.yml` (API, worker, Postgres, Redis). Reference architecture
covers PM2, containers, and Kubernetes with `/health` liveness and readiness
probes that check DB/Redis.

### P6 — Fail-fast config — **Shipped** (P4.3)

`validateConfig()` in `src/config/index.ts` refuses boot in
`NODE_ENV=production` when required secrets (`TOKEN_SECRET_HEX`,
`CSFLE_MASTER_KEY_HEX`, `METRICS_AUTH_TOKEN`, `CORS_ALLOWED_ORIGINS`,
`REDIS_URI`, backup encryption keys) are missing or weak.

### P7 — Domain-oriented service layout — shipped 2026-07-03

`src/services/` is grouped by domain (`auth/`, `billing/`, `notifications/`,
`compliance/`, `ops/`, `shared/`) with no flat root service files remaining.
The grouped layout keeps 48 service files navigable without changing runtime
module boundaries.

---

All proposals above are shipped. One long-term item remains — see
[`../todo.md`](../todo.md) (DQ-2 coverage ratchet).
