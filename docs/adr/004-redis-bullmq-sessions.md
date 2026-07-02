# ADR 004: Redis + BullMQ for Sessions, Rate Limiting, and Email Queue

**Status:** Accepted
**Date:** 2026-01 (initial), documented 2026-07-01
**Deciders:** Project maintainers

## Context

The system needs:

- **Fast session validation** — every authenticated request reads the current
  session state (active, `lastActivityAt`, concurrent-session cap).
- **Rate limiting** — per-IP, per-account, per-endpoint sliding windows with
  tuned point costs.
- **Email delivery** — a durable queue for transactional emails (magic links,
  MFA OTPs, billing notifications, notification fallback) that survives process
  restarts.

## Decision

Use **Redis** (via ioredis) for session caching and rate limiting, and
**BullMQ** (backed by Redis) for the email queue.

- Sessions live in Redis with a **PostgreSQL fallback** — when Redis is
  unreachable, the system degrades to DB-backed sessions gracefully (no 503s).
- `lastActivityAt` writes are debounced (not per-request) to reduce Redis load.
- Rate limiting uses a sliding-window algorithm with in-memory fallback when
  Redis is unavailable.
- BullMQ workers process email jobs with retry/backoff; the consumer starts
  with the API process when `WORKER_MODE` is unset (local dev / single-server);
  production API replicas set `WORKER_MODE=true` and defer to `src/worker.ts`
  (P1.2).

Redis is **optional** — when `REDIS_URI` is unset, sessions go straight to
PostgreSQL, rate limiting falls back to in-memory, and emails are sent
synchronously.

## Alternatives considered

| Option | Why rejected |
|---|---|
| **PostgreSQL-only (no Redis)** | Session reads on every request add DB load; rate-limiting DB queries create lock contention at scale. Redis offloads hot-path reads to a cache-optimised store. |
| **In-memory only (no Redis, no DB)** | Sessions don't survive process restarts; no horizontal scaling. Unacceptable for production. |
| **RabbitMQ / SQS for email queue** | Adds an operational dependency; Redis-based BullMQ uses infrastructure we already run and has a clean Node integration. |
| **Redis Streams (no BullMQ)** | Lower-level; BullMQ adds job lifecycle (retry, backoff, dead-letter, delayed jobs) that we would otherwise build ourselves. |

## Consequences

- **Positive:** Degrade gracefully — Redis outage does not take the API down.
  Sessions and rate limiting fall back to in-memory or Postgres automatically.
- **Positive:** BullMQ provides durable email delivery with retry/backoff and
  dead-letter jobs for observability.
- **Positive:** Redis is an established, well-understood component with
  excellent Node.js client libraries and managed offerings (Upstash, Redis
  Cloud, ElastiCache).
- **Negative:** Redis adds an operational dependency — it's one more service to
  monitor, backup, and scale. The `optional` flag means some deployments may
  skip it and accept the performance trade-off.
- **Negative:** The BullMQ consumer and interval schedulers must not run in
  every API replica. Production deploys set `WORKER_MODE=true` on API processes
  and run exactly one `bun run src/worker.ts` instance (see `docs/deployment.md`;
  P1.2). Redis leader locks in `jobs/scheduler.ts` remain a guardrail.

## References

- Session caching: `src/services/session.service.ts`
- Rate limiting: `src/middleware/rateLimiter/redis.ts`, `inmemory.ts`
- Email queue: `src/services/emailQueue.ts`
- Worker topology: `src/jobs/topology.ts`, `src/worker.ts`, `docs/deployment.md`
