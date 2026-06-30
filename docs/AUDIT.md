# Production-Readiness Audit

**Date:** 2026-06-29
**Scope:** Full repository — `src/` (Hono API), `packages/ui/` (Next.js), `packages/client/`
(generated SDK), build/CI config, migrations, and docs.
**Baseline at audit time:** type-check clean, `biome ci` clean, **726 tests passing**
(78 files), `verify:generated` clean.

This document is the standing audit. It complements [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
(current-state architecture) and supersedes the earlier dated audit/recommendation
snapshots now consolidated in [`docs/PROJECT_HISTORY.md`](./PROJECT_HISTORY.md).
Actionable follow-ups live in [`todo.md`](../todo.md).

---

## 1. Project overview

zerotrust is a production-oriented **auth + SaaS template**. It is a Bun monorepo
with three deployables:

| Package | What it is | Port |
| --- | --- | --- |
| `src/` | Hono + TypeScript HTTP API (27 route modules, ~50 services, ~20 middleware) | 1337 |
| `packages/ui/` | Next.js 16 (App Router, React 19) dashboard / admin / landing / PWA | 3000 |
| `packages/client/` | Dependency-free TypeScript SDK generated from `src/api/openapi.json` | — |

**Stack:** Bun (package manager + runtime for the API), Hono 4, Drizzle ORM on
PostgreSQL (48 tables, 26 migrations), Redis (ioredis) for sessions / rate
limiting / BullMQ email queue, Stripe billing, Sentry + OpenTelemetry +
prom-client for observability, Biome for lint/format, Vitest for tests,
semantic-release for releases.

**Auth model:** PASETO/opaque session tokens in httpOnly cookies, refresh-token
rotation, MFA (TOTP / email / SMS OTP), passkeys/WebAuthn, OAuth social login,
magic links, organizations & teams with org-scoped roles, cross-tenant JIT.

## 2. Architecture summary

A **modular monolith**: a single API process exposes route modules → services →
`db`/`redis`/`s3`, with no internal network hops between domains. Cross-cutting
concerns are middleware mounted once in `src/api/server.ts` (CORS → secure
headers → input sanitization → compression → metrics → telemetry → API
versioning → alerting → SLO). The UI talks to the API over HTTPS and is meant to
consume the generated SDK / `apiClient` wrapper rather than raw `fetch`.

Shared, canonical modules already exist for the patterns that would otherwise be
duplicated: pagination, counts, HTTP errors, role checks, safe redirects, safe
fetch (SSRF guard), crypto hashing, input sanitization, and a global error
handler. These are documented in [`CLAUDE.md`](../CLAUDE.md) and are the single
biggest maintainability asset in the repo.

## 3. Strengths

- **Security hardening is real and centralized.** A documented CWE table
  (CLAUDE.md) maps each class — open redirect, SSRF, command injection, path
  traversal, secrets-in-logs, ReDoS, weak crypto, XSS — to a canonical shared
  module that is actually used. Spot checks confirm the modules are wired in, not
  aspirational (e.g. the search highlight renderer deliberately avoids
  `dangerouslySetInnerHTML`; error logging redacts `password=`/`token=`; CORS
  fails closed in production).
- **CORS fails closed.** No allowlist configured in production → origin denied,
  not reflected (`src/middleware/cors.ts`).
- **Rate limiting is applied per-route** on every auth-sensitive endpoint
  (login, register, MFA, password reset, magic link) with tuned points/windows.
- **Strong test coverage** for a template — 726 tests including dedicated CWE
  regression tests (`dbBackup.cwe78.test.ts`, redaction tests, safe-redirect/safe-fetch).
- **Reproducibility tooling** — pinned formatters/codegen, a single
  `verify:generated` drift gate, scheduled dependency-update workflow.
- **Observability** — Prometheus `/metrics`, OpenTelemetry traces, Sentry,
  SLO burn-rate alerting, health/status endpoints with per-component state.
- **Read-replica support** and hot-path indexes already in place.

## 4. Findings by category

Risk legend: **Critical** (exploitable / data-loss now) · **High** (likely
incident under load or attack) · **Medium** (correctness/maintainability debt) ·
**Low** (hygiene).

### 4.1 Critical / Security

| # | Finding | Risk | Status |
| --- | --- | --- | --- |
| S1 | **Stripe webhook had no idempotency.** `POST /billing/webhook` verified the signature but processed every delivery, so a Stripe retry or a replayed (still-valid) event reprocessed subscription mutations — a money-path correctness hole (checklist #94). | Critical | **Fixed this PR** — see §6 |
| S2 | Other webhook/event consumers (email events `/webhooks/email`, SSF `/ssf/events`, user-defined webhook deliveries) verify signatures but do not persist a processed-event id, so a valid replay is reprocessed. Lower blast radius than billing but the same class. | High | TODO P0 |
| S3 | `/metrics` is open by default (only gated when `METRICS_AUTH_TOKEN` is set). Acceptable for a private scrape network, but a public deployment leaks internal cardinality/labels. Documented but easy to miss. | Medium | TODO P4 (doc/deploy default) |

### 4.2 Stability / correctness

| # | Finding | Risk | Status |
| --- | --- | --- | --- |
| C1 | **Hot-path writes are not transactional.** Only 2 files use `db.transaction` (`audit/chain.ts`, `org.routes.ts`). Refresh-token rotation, session lifecycle, billing mutations, wallet/points ledger, and org role transitions run as sequential statements — a crash between them leaves partial state. | High | TODO P1 |
| C2 | The Stripe webhook body is typed `any` end-to-end (`event: any`, `event.data.object as any`). A shape change from Stripe fails silently at runtime rather than at compile time. | Medium | **Fixed** (P2.1) — `Stripe.Event` + explicit per-case payload interfaces |
| C3 | Background schedulers (retention, billing lifecycle, backups, notification fallback) are fire-and-forget `setInterval`s started in-process with no shared job registry, retry/backoff, dead-letter, or idempotency keys. A second API replica runs every scheduler twice. | High | TODO P1 |
| C4 | **`compress()` middleware crashed the API under the pinned runtime.** Hono's `compress()` needs the global `CompressionStream`, absent in Bun < 1.3 (`.bun-version` pins 1.2.23, used by CI + dev). Every compressible response threw `ReferenceError: CompressionStream is not defined` → HTTP 500; this is why the Playwright E2E smoke was red (162× on `/auth/login`). Pre-existing on `main`, not introduced by this PR. | High | **Fixed this PR** — see §6 |

### 4.3 Maintainability

| # | Finding | Risk | Status |
| --- | --- | --- | --- |
| M1 | **No repository layer.** Routes/services call Drizzle inline. The codebase wants one (per TODO) so transactional invariants and authorization live in one testable place. | Medium | Seeded this PR (`src/db/repositories/`) |
| M2 | **213 `as any` casts** in `src/`. Concentrated in webhook/Stripe handling and a few middleware. Each is a place the type system stops helping. | Medium | TODO P2 |
| M3 | **No enforced module boundaries.** Any service can import any other; there is no `identity`/`billing`/`tenancy`/`ops` partition or import-linter, so coupling grows silently. | Medium | TODO P2 |

### 4.4 Scalability / performance

| # | Finding | Risk | Status |
| --- | --- | --- | --- |
| P1 | In-process `setInterval` schedulers (C3) do not scale horizontally — duplicate work per replica. Needs a single-leader or queue-backed scheduler. | High | TODO P1 |
| P2 | `checkout.session.completed` calls the Stripe API (`subscriptions.retrieve`) inside the request path; fine today, but webhook handlers should offload heavy work to the queue as volume grows. | Low | TODO P3 |
| P3 | Read-replica routing exists (`getReadDb`) but is opt-in per call site; list/admin/analytics endpoints should default to the replica. | Low | TODO P3 |

### 4.5 Testing gaps

| # | Finding | Risk | Status |
| --- | --- | --- | --- |
| T1 | **No UI component/integration tests.** `packages/ui` has only `lib/*.test.ts`; auth/billing/admin page flows are untested. | Medium | TODO P3 |
| T2 | No route-level test for billing-webhook idempotency end-to-end (the new repository is unit-tested; the handler path is not). | Low | TODO P1 |
| T3 | 2 dashboard E2E tests had drifted from the shipped UI (asserted copy/behavior no component renders); they were red on `main`, masked by the login-500 crash (C4). | Medium | **Fixed this PR** — see §6 |

### 4.6 Documentation gaps

| # | Finding | Risk | Status |
| --- | --- | --- | --- |
| D1 | Many phase docs (`PHASE_*`) describe completed migrations; there was **no single standing audit + prioritized TODO** with acceptance criteria. | Low | Fixed this PR (`docs/AUDIT.md`, `todo.md`) |
| D2 | No ADRs for the load-bearing decisions (PASETO vs JWT, monolith vs split, Drizzle as source of truth, queue choice, token storage). | Low | TODO P4 |

## 5. Recommended upgrades (suggested implementation order)

1. **Webhook/event idempotency** — billing (done), then email-events, SSF, and
   user webhook deliveries (S1 → S2).
2. **Repository + transaction layer** for refresh-token rotation, session
   lifecycle, billing, wallet/points ledger, org role transitions (C1, M1).
3. **Centralized jobs module** with Zod payloads, retry/backoff, dead-letter,
   idempotency keys, and single-leader scheduling (C3, P1).
4. **Module boundaries + import-linter** and an ADR for dependency direction (M3).
5. **Typed Stripe/event payloads**, chip away at `as any` (C2, M2).
6. **UI component/integration tests** for auth/billing/admin flows (T1).
7. **ADRs + maintenance scorecard** (D2).

## 6. Changes made in this audit pass

- **Fixed S1 (Critical): Stripe webhook idempotency.**
  - New table `processed_stripe_events` (migration `0025_burly_mindworm.sql`).
  - New repository `src/db/repositories/stripeEvents.repository.ts`
    (`claimStripeEvent` / `releaseStripeEvent`) — seeds the repository layer (M1).
  - `billing.webhooks.ts` now claims each event id before applying it (replays
    become a logged no-op) and releases the claim if processing throws, so
    Stripe's retry can reprocess. Atomic via `INSERT … ON CONFLICT DO NOTHING`.
  - Unit tests: `src/__tests__/stripeEvents.repository.test.ts`.
- **Fixed C4 (High): `compress()` 500s under Bun < 1.3.** Guarded the middleware
  mount in `src/api/server.ts` with `"CompressionStream" in globalThis` so
  compression is skipped (not fatal) on runtimes lacking the global. Unblocks the
  Playwright E2E smoke; Node 18+ / Bun ≥ 1.3 still compress normally.
- **Reconciled 2 drifted E2E tests (T3).** `packages/ui/e2e/dashboard-polish.spec.ts`
  asserted dashboard copy/behavior that no shipped component provides ("Setup
  progress"/"Profile strength"/"Usage readiness"/"4/4" + a `localStorage`
  `za_onboarding_completed` flag). The actual dashboard renders `ProgressBars`
  ("Your Progress"/"Profile completeness"/"4/4 fields") and `SetupChecklist`
  (completion card + POST `/auth/me/onboarding-complete`). The tests had been
  failing on `main` too but were masked by the login-500 crash above; updated them
  to the shipped behavior. No product/UI change.
- Authored this `docs/AUDIT.md` and a prioritized, acceptance-criteria-driven
  [`todo.md`](../todo.md).

> **Pre-existing CI note:** the **SAST & Dependency Scans (Semgrep)** check is
> also red on `main` (independent of this PR's diff). Triaged as out of scope for
> this change; tracked separately rather than fixed here.

All changes verified: type-check clean, `biome` clean, 726 tests passing,
`verify:generated` clean.
