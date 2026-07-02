# Codebase Audit Report — SaaS Starter Template Readiness

**Date:** 2026-07-03
**Scope:** Full repo (`src/` Hono API + `packages/ui/` Next.js 16 + `packages/client/` SDK + infra/docs)
**Audited by:** Hermes Agent (static scan + build/test/lint verification)
**Purpose:** Determine readiness to fork as a base for a new SaaS project.

---

### Open follow-ups (still in [`todo.md`](./todo.md))

| ID     | Status  | Summary                                                                                   |
| ------ | ------- | ----------------------------------------------------------------------------------------- |
| **E5** | 🟡 Info | In-process `setInterval` schedulers — mitigated by `WORKER_MODE` + dedicated worker; Redis leader lock remains guardrail |

---

## D. Security review (mandatory CWE table — all mitigated)

**One token-handling note:** access/refresh tokens are stored in `localStorage` (`packages/ui/src/lib/auth.ts`), not httpOnly cookies. This is a deliberate tradeoff for the SPA architecture (the API is on port 1337, UI on 3000 — different origins), but it means **the tokens are readable by any injected JS**. For a fork where stronger XSS-resistance is required, consider moving to httpOnly cookies + BFF pattern. Not a regression — just a design decision to revisit.

---

## E. Architecture / maintainability debt

### E5. 🟡 Background scheduler is in-process (documented, mitigated)

`docs/AUDIT.md` C3/P1 flags this: `setInterval`-based schedulers in `src/jobs/scheduler.ts` run in every API replica unless `WORKER_MODE=true`. Production deploy blueprints (README PM2, `docker-compose.yml`, `docs/reference-architecture.md`) default API replicas to `WORKER_MODE=true` with exactly one dedicated worker (`src/worker.ts`). The leader-election lock remains a guardrail. Fine for a starter template; queue-backed scheduling is a future scale-out path.

### E6. ✅ Repository layer expanded (P1.1 + P1.4)

`docs/AUDIT.md` C1/M1: nine transactional repositories under `src/db/repositories/` now cover auth sessions, billing, orgs, wallet, Stripe/webhook idempotency, points ledger, support tickets, and passkeys. Hot-path routes delegate multi-statement mutations; remaining inline Drizzle is mostly reads and single-row updates (MFA, admin list filters).

---
