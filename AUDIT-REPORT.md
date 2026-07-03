# Codebase Audit Report — SaaS Starter Template Readiness

**Date:** 2026-07-03
**Scope:** Full repo (`src/` Hono API + `packages/ui/` Next.js 16 + `packages/client/` SDK + infra/docs)
**Audited by:** Hermes Agent (static scan + build/test/lint verification)
**Purpose:** Determine readiness to fork as a base for a new SaaS project.

---

## D. Security review (mandatory CWE table — all mitigated)

**One token-handling note:** access/refresh tokens are stored in `localStorage` (`packages/ui/src/lib/auth.ts`), not httpOnly cookies. This is a deliberate tradeoff for the SPA architecture (the API is on port 1337, UI on 3000 — different origins), but it means **the tokens are readable by any injected JS**. For a fork where stronger XSS-resistance is required, consider moving to httpOnly cookies + BFF pattern. Not a regression — just a design decision to revisit.

---

## E. Architecture / maintainability debt

### E5. ✅ Queue-backed cron scheduling (P2 infrastructure backlog / B5)

`docs/AUDIT.md` C3/P1 tracked this: scheduled jobs now dispatch through a BullMQ job scheduler (`src/jobs/scheduler.ts`, `Queue.upsertJobScheduler`) with retry/exponential-backoff and dead-letter visibility (`getFailedScheduledJobs()`), replacing the `setInterval` + Redis-leader-lock design — BullMQ's atomic per-job delivery is the duplicate-execution guard now. Idempotency (registry `idempotencyKey`) still guards replay, proven by scheduler unit tests (idempotent replay is a no-op; a failed attempt is not marked complete, so a retry re-executes the handler). Production deploy blueprints (README PM2, `docker-compose.yml`, `docs/reference-architecture.md`) default API replicas to `WORKER_MODE=true` with exactly one dedicated worker (`src/worker.ts`) that owns the BullMQ scheduler consumer. See [`tdone.md`](./tdone.md) §P2 — Infrastructure backlog.

### E6. ✅ Repository layer expanded (P1.1 + P1.4)

`docs/AUDIT.md` C1/M1: nine transactional repositories under `src/db/repositories/` now cover auth sessions, billing, orgs, wallet, Stripe/webhook idempotency, points ledger, support tickets, and passkeys. Hot-path routes delegate multi-statement mutations; remaining inline Drizzle is mostly reads and single-row updates (MFA, admin list filters).

---
