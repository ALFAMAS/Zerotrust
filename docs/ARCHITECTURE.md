# Architecture

Audited 2026-06-28. Describes
the system as it is today, then proposes upgrades. Forward-looking operational
fixes that overlap with CI/deploy safety live in the backlog
([`../todo.md`](../todo.md)); the standing audit is [`AUDIT.md`](./AUDIT.md).

## 1. Overview

zerotrust is a **Bun monorepo** with three deployables:

| Package | What it is | Port |
| --- | --- | --- |
| `src/` | Hono + TypeScript HTTP API | 1337 |
| `packages/ui/` | Next.js 16 (App Router, React 19) dashboard/admin/landing | 3000 |
| `packages/client/` | Generated, dependency-free TypeScript SDK (from `src/api/openapi.json`) | — |

It is a **modular monolith**: one API process exposes ~27 route modules backed
by ~45 services and ~21 middleware, persisting to PostgreSQL (41 tables) with
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
   `rateLimiting`, `requirePlan`, `requireAdmin`, `geoFencing`, `temporalAccess`,
   `continuousVerification`, `tokenBinding`, `deviceAttestation`, `sessionControl`.

Auth resolves a `user` (and optional `apiKey`) onto the Hono context; handlers
read it via `c.get("user")`.

## 3. Module map (`src/`)

| Area | Dir(s) | Responsibility |
| --- | --- | --- |
| HTTP | `api/` | Hono app, route mounting, OpenAPI spec |
| Domain logic | `services/` (~45) | token, session, email/queue, MFA, OAuth, billing, wallet, globalization, search, compliance, backup, SLO, alerting… |
| Middleware | `middleware/` (~20) | auth, rate limiting, CSRF/headers, plan gating, abuse defense, API versioning |
| Data | `db/` | Drizzle schema (41 tables) + connection; `models/` thin table re-exports |
| Crypto | `crypto/` | `paseto-v4` (v4.local), `csfle` (field encryption), `hardware-key-store`, `codes` |
| MFA | `mfa/` | TOTP, Email OTP channel, FIDO MDS3 |
| OAuth | `oauth/` | provider factory + adapters (Google/GitHub/Apple/Facebook) |
| Access | `jit/` | cross-tenant just-in-time elevation |
| Platform | `audit/` `metrics/` `telemetry/` `webhooks/` `notifications/` `ssf/` | hash-chained audit log, Prometheus, OTel, outbound webhooks, SSF receiver |
| Cross-cutting | `shared/` `config/` `logger/` `templates/` | safe-fetch/redirect guards, typed config, structured logging, email templates |

## 4. State & data

- **PostgreSQL** (Drizzle ORM, `postgres` driver) — system of record, 41 tables,
  27 versioned migrations in `drizzle/`. Sensitive columns use **CSFLE**
  (client-side field encryption) with key-version rotation.
- **Redis** (ioredis) — session validation cache (`session:{tokenId}` with
  debounced `lastActivityAt` writes and **DB fallback when Redis is down**),
  sliding-window rate limiting (`rateLimiter/redis.ts`, with `inmemory.ts`
  fallback), and the **BullMQ** email queue.
- **Elasticsearch** (optional) — audit-log mirror + full-text search; the search
  service falls back to Postgres `ILIKE` when ES is unset.
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

Started in-process by `startServer()`:

- **BullMQ email queue** consumer (when `REDIS_URI` is set).
- Cron-style schedulers (24h): data retention purge, notification email
  fallback, billing lifecycle (trial/dunning/win-back), `pg_dump` backup.

> ⚠️ See **Proposed upgrade P1** — these run in the same process as HTTP and are
> **not instance-guarded**, which is unsafe under the README's PM2 cluster mode.

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
client) and the generated SDK. Many dashboard pages fetch **client-side** in
`useEffect`. A built-in Next.js MCP dev server is exposed at `/_next/mcp` for
coding agents.

---

## Proposed upgrades

Prioritized; **P1 is a correctness bug**, the rest are improvements.

| # | Change | Why | Effort |
| --- | --- | --- | --- |
| **P1** | Split HTTP and worker/scheduler processes (or instance-guard the schedulers) | **Correctness** — duplicate jobs under cluster mode | M |
| P2 | Adopt expand/contract migrations; gate destructive DDL | Safe rollbacks; the `0020`–`0024` drops are irreversible | S–M |
| P3 | Make Elasticsearch fully optional / default to Postgres FTS | Drop an operational dependency post-slim-down | M |
| P4 | Move hot dashboard reads to Server Components / route handlers | TTFB, fewer client waterfalls | M |
| P5 | Containerize (Dockerfile + compose) and split health/readiness | Reproducible deploys, orchestrator-friendly | M |
| P6 | Fail-fast typed config validation at boot | Catch missing prod secrets before serving traffic | S |
| P7 | Group `services/` by domain | Navigability now that the surface is smaller | S |

### P1 — Separate the worker from the API process (correctness)

`startServer()` unconditionally calls `startRetentionScheduler`,
`startNotificationEmailFallbackScheduler`, `startBillingLifecycleScheduler`,
`startBackupScheduler`, and `initEmailQueue`. The production guide runs the API
under **PM2 cluster mode** (`pm2 start … -i max`), so **every** worker process
starts its own copy of each scheduler and a BullMQ consumer. Effects: N nightly
`pg_dump` backups, duplicate dunning/win-back emails per user, and racing
retention purges.

**Recommended:** extract a dedicated `src/worker.ts` entrypoint that owns the
BullMQ consumers and the cron schedulers; run it as a **single** PM2 fork
(`-i 1`) while the HTTP API scales horizontally and stays stateless. Cheaper
interim fix: guard each scheduler behind a Redis lock or
`process.env.NODE_APP_INSTANCE === "0"`.

### P2 — Migration safety

41 tables / 27 migrations, several recent ones `DROP … CASCADE`. Add a
"deploy code that stops using the column → ship → drop in a later release"
(expand/contract) discipline and a pre-migration verified backup step (see
[`../todo.md`](../todo.md) P3.5). Consider a CI check that flags `DROP`/`ALTER …
DROP` in new migrations for explicit human sign-off.

### P3 — Reconsider Elasticsearch

After removing collaboration/notes, the searchable surface is just
user/org/ticket and the service already has a Postgres fallback. For most
deployments a Postgres `tsvector` + GIN index covers this without running ES.
Keep ES as an opt-in for large tenants; default off to shed an operational
dependency — consistent with the slim-down's goal.

### P4 — Server-side data fetching on the dashboard

Several dashboard/admin pages do `api.get(...)` inside `useEffect`, creating
client-side request waterfalls and slower TTFB. Next 16 RSC + route handlers (or
a server action layer) can fetch on the server with the session cookie, cutting
round-trips and shipping less client JS.

### P5 — Containerized, orchestrator-friendly deploys

The reference deploy is bare-metal PM2 + nginx. A `Dockerfile` (API + worker
targets) and `docker-compose.yml` (API, worker, Postgres, Redis) would make
deploys reproducible and pair naturally with P1's process split. Distinguish
`/health` (liveness) from a true readiness probe that checks DB/Redis before
accepting traffic.

### P6 — Fail-fast config

`src/config` is typed but a boot-time `zod` validation that **refuses to start**
in `NODE_ENV=production` when required secrets (`TOKEN_SECRET_HEX`,
`CSFLE_MASTER_KEY_HEX`, `DATABASE_URL`, backup encryption) are missing or weak
would turn silent misconfiguration into a loud, early failure.

### P7 — Domain-oriented service layout

`services/` is a flat directory of ~48 files. Grouping by domain (`auth/`,
`billing/`, `notifications/`, `compliance/`, `ops/`) improves discoverability now
that the feature set is smaller and more focused.

---

These proposals are advisory. P1 and P2 are the highest-leverage and map to open
items in the backlog ([`../todo.md`](../todo.md)).
