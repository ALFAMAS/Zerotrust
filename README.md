<div align="center">

# zerotrust

**A production-ready SaaS starter you can clone, brand, and ship.**

Full-stack monorepo: Hono API + Next.js dashboard/admin, with authentication,
multi-tenant organizations, Stripe billing, compliance docs, and security
hardening already wired — so you build product features instead of rebuilding
login for the hundredth time.

[![CI](https://github.com/ALFAMAS/zerotrust/actions/workflows/ci.yml/badge.svg)](https://github.com/ALFAMAS/zerotrust/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-1.x-black?logo=bun&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-4-e36002)

</div>

---

## Table of contents

- [Who this is for](#who-this-is-for)
- [Why clone this instead of rolling your own](#why-clone-this-instead-of-rolling-your-own)
- [What's included](#whats-included)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Production checklist](#production-checklist)
- [Project structure](#project-structure)
- [Configuration](#configuration)
- [Security & compliance](#security--compliance)
- [Customizing](#customizing)
- [API overview](#api-overview)
- [Testing & code quality](#testing--code-quality)
- [Production deployment](#production-deployment)
- [Project status](#project-status)
- [Contributing](#contributing)
- [Support](#support)
- [License](#license)

---

## Who this is for

zerotrust is for developers and teams who want a **real SaaS foundation** — not a
tutorial auth demo. Clone it when you need:

- Multi-tenant **organizations** with roles, invites, and per-org security policies
- **Production auth** — password, OAuth, magic links, MFA, WebAuthn/passkeys, sessions
- **Stripe billing** — checkout, portal, trials, dunning, plan gates, wallet
- A **Next.js app** with landing page, user dashboard, and admin console
- **Operability** — metrics, tracing, backups, audit logs, compliance runbooks

You get a modular monolith you can deploy on a VPS, containers, or Kubernetes
(see [`docs/reference-architecture.md`](./docs/reference-architecture.md)), with
a generated TypeScript SDK in `packages/client`.

> **Source of truth for shipped features:** this README summarizes what ships
> today. The full catalog lives in [`docs/project/shipped.md`](./docs/project/shipped.md); open backlog in
> [`docs/project/todo.md`](./docs/project/todo.md).

---

## Why clone this instead of rolling your own

Authentication and tenant isolation are high-stakes, time-consuming, and easy to
get subtly wrong. zerotrust ships the hard parts already integrated:

| You avoid…                                       | zerotrust ships…                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| Weeks on login, sessions, and token rotation     | PASETO v4 access tokens, hashed refresh rotation, session lifecycle |
| Bolt-on MFA and passkeys later                   | TOTP, email OTP, WebAuthn (FIDO2), magic links                      |
| Rebuilding org RBAC from scratch                 | Organizations, custom roles, JIT cross-tenant access                |
| Stripe webhook idempotency bugs                  | Replay-safe webhook handling, plan gates, billing lifecycle         |
| "We'll add compliance later"                     | SOC 2 readiness docs, audit hash-chain, backup runbooks             |
| Security footguns in redirects, fetches, uploads | CWE-hardened patterns enforced across the codebase                  |

This is **batteries included**, not a minimal JWT example. Fork it, rename it,
point DNS at it, and focus on your product surface.

---

## What's included

### Authentication & identity

- Email + password with progressive login backoff (exponential delay + PoW at threshold)
- OAuth — Google, GitHub, Facebook, Apple (admin-toggleable per provider)
- Magic links (passwordless, 15-minute TTL) — [`plugins/magic-link/`](./plugins/magic-link/)
- Passkeys / WebAuthn (FIDO2, resident keys, MDS3 attestation policy)
- TOTP (Google Authenticator / Authy) + email OTP
- PASETO v4 access tokens + rotating, hashed refresh tokens
- Session management — list, revoke, device fingerprinting, concurrent-session caps

### Organizations & access

- Organizations & teams — workspaces, invites, custom roles with fine-grained permissions
- Cross-tenant JIT access — request + admin-approval inbox, auto-expiring grants

### Access control & abuse defense

- RBAC + ABAC with just-in-time privilege escalation
- Continuous access evaluation — re-verification after sensitive operations
- Anomaly detection — unusual location / time / device
- Rate limiting — Redis-backed sliding window with in-memory fallback
- Credential-stuffing defense, account-takeover detection, optional signup proof-of-work

### Billing & growth

- Stripe billing — checkout, customer portal, idempotent webhooks (replay-safe), per-org subscriptions
- Plan feature gates (`requirePlan()`), 14-day trials, dunning, win-back, cancellation flow
- API key management — named keys, SHA-256 hashed, scopes, revoke
- Multi-currency pricing, PPP discounts, tax quotes, VAT validation, and tax exemptions
- Wallet (balance, top-up, spend, transaction history)

### Frontend (Next.js)

- Landing page, user dashboard, and guarded admin panel in one app
- Admin consoles — users, revenue, sessions, auth settings, JIT, and SOC 2 / risk compliance
- PWA — installable, offline app-shell, web push (VAPID)
- i18n (next-intl, EN/ES/FR/AR with RTL support), locale-aware `Intl.*` formatting, dark mode
- GDPR — cookie consent, data export, 30-day soft-delete; privacy/terms pages
- Notification center (SSE real-time + email fallback), feedback widget, product tour
- Command palette (client-side page navigator)

### Compliance & operations

- Tamper-evident audit log (SHA-256 hash-chain) in Postgres + optional Elasticsearch/SIEM fan-out
- Replay-safe email bounce/complaint, SSF, and user-defined webhook event handling
- Access reviews tooling, data-retention auto-purge
- SOC 2 readiness controls, risk register, privacy records, and compliance runbooks
- Prometheus metrics, OpenTelemetry tracing, public `/status` page
- S3-compatible storage (AWS S3, Backblaze B2, Cloudflare R2, MinIO, Wasabi) for backups and user uploads
- Automated `pg_dump` backups with local + S3 retention
- SLO burn-rate reporting, read-replica support, k6 load/chaos harnesses

---

## Architecture

zerotrust is a **Bun monorepo**: a standalone Hono API and a Next.js app that
talks to it over HTTP. One API process exposes ~27 route modules backed by
~45 services; PostgreSQL holds state; Redis backs sessions, rate limiting, and
the BullMQ email queue.

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  Next.js app (port 3000) │  HTTP   │   Hono API (port 1337)    │
│  landing · dashboard ·   │ ──────▶ │   src/api/server.ts       │
│  admin · PWA             │         │   auth · orgs · billing…  │
└─────────────────────────┘         └────────────┬─────────────┘
                                                  │
                          ┌───────────────────────┼───────────────────────┐
                          ▼                        ▼                        ▼
                   PostgreSQL (5432)        Redis (6379)         Elasticsearch (9200, opt-in)
                   Drizzle ORM              sessions/rate-limit  search mirror + audit fan-out
                                            /BullMQ queue        (large tenants only)
```

| Service             | Local URL                  | Notes                                     |
| ------------------- | -------------------------- | ----------------------------------------- |
| API server          | http://localhost:1337      | `PORT` env (default **1337**)             |
| Next.js app + admin | http://localhost:3000      | admin panel at `/admin`                   |
| API docs (Scalar)   | http://localhost:1337/docs | dev; production opt-in                    |
| Queue dashboard     | http://localhost:1337/admin/queues | admin-only; production opt-in       |
| Email previews      | http://localhost:3001      | `bun run email:dev`; development only     |
| Health / metrics    | `/healthz` · `/metrics`    | on the API port                           |
| Next.js MCP (dev)   | `/_next/mcp`               | coding-agent tools when `bun dev:ui` runs |
| PostgreSQL          | localhost:5432             | or a managed provider (e.g. Neon)         |
| Redis               | localhost:6379             | optional in dev — in-memory fallback      |

**Background work:** a BullMQ email-queue consumer plus scheduled jobs (data
retention, billing lifecycle, `pg_dump` backup, audit anchoring) run in
`src/worker.ts`. In local dev the API starts schedulers in-process when
`WORKER_MODE` is unset; production should run a dedicated worker with
`WORKER_MODE=true` on API replicas.

> **Deep dive:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

---

## Tech stack

| Layer         | Technology                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------- |
| API           | [Hono](https://hono.dev) 4 · TypeScript 6 · run on [Bun](https://bun.sh)                    |
| Database      | PostgreSQL via [Drizzle ORM](https://orm.drizzle.team) (works with Neon)                    |
| Cache / queue | Redis (ioredis) · [BullMQ](https://docs.bullmq.io) email queue                              |
| Frontend      | [Next.js](https://nextjs.org) 16 (App Router) · Tailwind CSS · shadcn/ui                    |
| Crypto        | PASETO v4, `@noble/*`, CSFLE field encryption                                               |
| Auth libs     | `@simplewebauthn/server` (WebAuthn) · `otpauth` (TOTP)                                      |
| Observability | Prometheus (`prom-client`) · OpenTelemetry · Sentry                                         |
| SDK           | Generated TypeScript client in `packages/client` from `src/api/openapi.json`                |
| Tooling       | [Biome](https://biomejs.dev) (lint+format) · Vitest · Playwright · Husky · semantic-release |

---

## Quick start

**Prerequisites:** [Bun](https://bun.sh) 1.x · PostgreSQL 15+ · Redis 7 (optional in dev)

```bash
# 1. Clone
git clone https://github.com/ALFAMAS/zerotrust my-app
cd my-app

# 2. Install (API + packages/ui workspaces)
bun install

# 3. Configure environment
cp .env.example .env
```

Generate required secrets and paste into `.env`:

```bash
openssl rand -hex 32   # → TOKEN_SECRET_HEX
openssl rand -hex 32   # → CSFLE_MASTER_KEY_HEX
```

Set `DATABASE_URL` (and `REDIS_URI` if you have Redis). Set `ADMIN_EMAIL` for
the bootstrap step below.

```bash
# 4. Create the schema
bun run db:migrate       # versioned migrations — also carries RLS + audit triggers
# (`db:push` is fine for rapid dev iteration, but it syncs tables only:
#  the RLS policies and audit-immutability triggers ship as SQL migrations)

# 5. Bootstrap your first admin + default org (idempotent)
bun run bootstrap:admin

# 6. Start API + UI (hot reload on both)
bun run dev
```

| URL                   | What                                       |
| --------------------- | ------------------------------------------ |
| http://localhost:1337 | API                                        |
| http://localhost:3000 | App (login at `/login`, admin at `/admin`) |

Point the UI at the API:

```bash
# packages/ui/.env.local
NEXT_PUBLIC_ZEROTRUST_URL=http://localhost:1337
```

Run services individually if you prefer:

```bash
bun run dev:api    # API only (port 1337)
bun run dev:ui     # UI only (port 3000, also starts the Next.js MCP server)
```

### Bootstrap admin

`bun run bootstrap:admin` creates a verified admin user, assigns the `admin`
system role, and creates a default org owned by that user. Safe to re-run —
exits cleanly if an admin already exists.

| Variable             | Required | Description                                        |
| -------------------- | -------- | -------------------------------------------------- |
| `ADMIN_EMAIL`        | ✅       | Email for the bootstrap admin                      |
| `ADMIN_PASSWORD`     | —        | Plain-text password (prompted securely when unset) |
| `ADMIN_DISPLAY_NAME` | —        | Display name (defaults from email local-part)      |
| `BOOTSTRAP_ORG_NAME` | —        | Default org name (`My Organization`)               |
| `BOOTSTRAP_ORG_SLUG` | —        | Org slug (derived from name when unset)            |

---

## Scripts

| Command                            | Purpose                              |
| ---------------------------------- | ------------------------------------ |
| `bun run dev`                      | API + UI concurrently                |
| `bun run dev:api` / `dev:ui`       | Run one side only                    |
| `bun run build`                    | Compile API to `dist/`               |
| `bun run db:push`                  | Sync tables from code (dev only — no RLS/trigger DDL) |
| `bun run db:migrate`               | Apply versioned migrations (staging/prod + fresh setups) |
| `bun run db:studio`                | Drizzle Studio                       |
| `bun run bootstrap:admin`          | First admin + default org            |
| `bun run db:backup` / `db:restore` | Encrypted `pg_dump` backup/restore   |
| `bun run test`                     | Vitest suite (API + UI logic)        |
| `bun run test:integration:containers` | Hermetic Postgres + Redis integration tests |
| `bun run email:dev`                | Hot-reloading gallery for all nine emails |
| `bun run lint` / `lint:fix`        | Biome check / autofix                |
| `bun run type-check`               | `tsc --noEmit`                       |
| `bun run verify:generated`         | Regenerate SDK + docs; fail on drift |
| `bun run sdk:generate`             | Regenerate `packages/client` SDK     |
| `bun run docs:api`                 | Regenerate API reference markdown    |

---

## Production checklist

Use this before pointing real users at your deployment.

**Full operator checklist (audit-backed, sign-off tables):**
[`docs/production-checklist.md`](./docs/production-checklist.md)

### Required infrastructure

- [ ] **PostgreSQL** — managed (Neon, RDS, etc.) or self-hosted; provision with `db:migrate`
      (never `db:push` — RLS tenant-isolation policies and audit triggers only exist in the
      migration chain)
- [ ] **Redis** — required in production (`REDIS_URI`); sessions, rate limits, BullMQ queues
- [ ] **Separate worker** — one `src/worker.ts` process; set `WORKER_MODE=true` on API replicas

### Secrets & crypto (app refuses to boot in production without these)

- [ ] `TOKEN_SECRET_HEX` — 32-byte hex (`openssl rand -hex 32`)
- [ ] `CSFLE_MASTER_KEY_HEX` — 32-byte hex for field encryption
- [ ] `NODE_ENV=production`
- [ ] `CORS_ALLOWED_ORIGINS` — explicit browser origins (no wildcard in prod)
- [ ] `METRICS_AUTH_TOKEN` — protects `/metrics` scrape endpoint
- [ ] `BACKUP_ENCRYPTION_KEY_HEX` + `BACKUP_REQUIRE_ENCRYPTION=true` (unless `BACKUP_ENABLED=false`)
- [ ] Keep `API_DOCS_ENABLED=false`, or explicitly set `true` to publish Scalar at `/docs`
- [ ] Keep `QUEUE_DASHBOARD_ENABLED=false`, or explicitly set `true` for admin Bull Board access

### Auth & domains

- [ ] `API_BASE_URL` — public API URL (HTTPS)
- [ ] `WEBAUTHN_RP_ID` — registrable domain (e.g. `yourdomain.com`)
- [ ] `WEBAUTHN_RP_ORIGINS` — exact HTTPS origins for passkeys
- [ ] `MAIL_*` — SMTP for magic links, OTP, transactional email
- [ ] OAuth `OAUTH_<PROVIDER>_*` — per provider you enable

### Billing (when monetizing)

- [ ] `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
- [ ] `STRIPE_PRODUCT_PRO` / `STRIPE_PRODUCT_ENTERPRISE` — product → plan mapping
- [ ] Stripe webhook endpoint → `POST /billing/webhook`

### Backups & storage

- [ ] `BACKUP_ENABLED=true` with `BACKUP_ENCRYPTION_KEY_HEX`
- [ ] `BACKUP_S3_*` — S3-compatible bucket for off-site dumps (optional but recommended)
- [ ] `UPLOADS_S3_PREFIX` / `UPLOADS_CDN_URL` — avatar and file uploads

### Observability & hardening

- [ ] `SENTRY_DSN` (API) and `NEXT_PUBLIC_SENTRY_DSN` (UI)
- [ ] `SECURITY_CONTACT` — served at `/.well-known/security.txt`
- [ ] Review [`docs/security.md`](./docs/security.md) baseline (tenant isolation, RLS, auth boundaries)
- [ ] Run `bun run bootstrap:admin` once on a fresh production DB (or promote via admin UI later)

### Frontend

- [ ] `packages/ui/.env.local` — `NEXT_PUBLIC_ZEROTRUST_URL=https://api.yourdomain.com`
- [ ] TLS termination (nginx, Caddy, load balancer) — API on 1337, UI on 3000

> **Full deploy guide:** [`docs/deployment.md`](./docs/deployment.md) · **VM/K8s blueprints:** [`docs/reference-architecture.md`](./docs/reference-architecture.md)

---

## Project structure

> **New to the codebase?** Start with the guided
> [codebase tour](./docs/codebase-tour.md) — request flow, what lives where,
> and "where do I add X".

```
.
├── plugins/                 # Feature plugins (magic-link, mfa, oauth — see docs/plugins.md)
├── src/                     # Hono API core
│   ├── api/server.ts        # App entry (port 1337)
│   ├── api/routes/          # Route modules
│   ├── db/                  # Drizzle schema + repositories
│   ├── services/            # Business logic (auth, billing, email, backup…)
│   ├── middleware/          # Auth, rate limit, CSRF, input sanitization
│   ├── shared/              # Pagination, permissions, safeRedirect, safeFetch…
│   ├── <feature>/           # One flat dir per subsystem: audit, crypto, jit, jobs,
│   │                        #   mfa, notifications, scim, ssf, webhooks, metrics…
│   └── __tests__/           # Vitest tests
├── packages/
│   ├── client/              # Generated TypeScript SDK
│   └── ui/                  # Next.js 16 app (port 3000)
├── drizzle/                 # SQL migrations
├── docs/
│   ├── compliance/          # SOC 2 policies, runbooks, evidence templates
│   ├── production-checklist.md  # Operator sign-off checklist
│   └── project/             # todo.md (backlog) + shipped.md (catalog)
├── scripts/                 # bootstrap-admin, db-backup, postinstall…
└── .env.example             # All env vars, documented inline
```

---

## Configuration

All variables are documented inline in [`.env.example`](./.env.example). Highlights:

| Variable               | Required  | Description                             |
| ---------------------- | --------- | --------------------------------------- |
| `TOKEN_SECRET_HEX`     | ✅ prod   | Signs PASETO v4 tokens                  |
| `CSFLE_MASTER_KEY_HEX` | ✅ prod   | Client-side field encryption            |
| `DATABASE_URL`         | ✅        | PostgreSQL connection string            |
| `REDIS_URI`            | ✅ prod   | Sessions, rate limiting, BullMQ         |
| `ADMIN_EMAIL`          | bootstrap | First admin email for `bootstrap:admin` |
| `STRIPE_SECRET_KEY`    | billing   | Enables checkout/portal when set        |
| `BACKUP_S3_*`          | optional  | S3-compatible backups + uploads         |

**Frontend** (`packages/ui/.env.local`):

| Variable                    | Description                              |
| --------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_ZEROTRUST_URL` | Backend API base URL (no trailing slash) |
| `NEXT_PUBLIC_APP_NAME`      | App name in UI, emails, meta tags        |
| `NEXT_PUBLIC_SENTRY_DSN`    | Browser error capture                    |

S3-compatible storage uses one adapter for DB backups (`backups/` prefix) and
user uploads (`uploads/` prefix). When unset, backups stay local and avatars
fall back to disk. See `BACKUP_S3_*`, `BACKUP_ENCRYPTION_*`, and `UPLOADS_S3_*`
blocks in `.env.example`.

---

## Security & compliance

### Security baseline

zerotrust enforces a documented security baseline across auth, tenant
isolation, and common vulnerability classes (CWE-601 open redirects, CWE-918
SSRF, CWE-78 command injection, CWE-22 path traversal, CWE-532 secrets in logs,
and others). Agent and contributor rules in [`CLAUDE.md`](./CLAUDE.md) and
[`AGENTS.md`](./AGENTS.md) encode these patterns — do not bypass them.

| Topic                         | Where to read                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------- |
| Structural security decisions | [`docs/security.md`](./docs/security.md)                                         |
| Vulnerability disclosure      | [`SECURITY.md`](./SECURITY.md) · `/.well-known/security.txt`                     |
| Open backlog                  | [`docs/project/todo.md`](./docs/project/todo.md)                                 |
| Shipped security fixes        | [`docs/project/shipped.md`](./docs/project/shipped.md) § Security baseline audit |
| Production readiness          | [`docs/production-checklist.md`](./docs/production-checklist.md)                 |

**Highlights:**

- PASETO v4 access tokens; refresh tokens SHA-256-hashed and rotated on use
- Argon2id password hashing (bcrypt verify/rehash fallback)
- CSFLE field encryption with key-version rotation
- Global input sanitization middleware (XSS / CWE-79)
- Tamper-evident SHA-256 hash-chained audit log in Postgres
- HIBP breach checks, credential-stuffing defense, progressive login backoff

### Compliance program

Operational compliance docs (policies, runbooks, evidence templates) live in
[`docs/compliance/`](./docs/compliance/README.md). The product ships admin
surfaces for SOC 2 readiness, risk assessment, access reviews, and audit-log
verification — these support your compliance program; they do not replace an
auditor.

---

## Customizing

> **Adding integrations** (OAuth provider, email/SMS, S3 storage)? See
> [`docs/extending.md`](./docs/extending.md).

- **Rename the app** — set `NEXT_PUBLIC_APP_NAME`; update metadata in `packages/ui/src/app/`
- **Toggle auth methods** — Admin → **Auth Settings** (live, no restart)
- **Add an API route** — mount in `src/api/server.ts`; reuse `authMiddleware`, `assertCan()`
- **Add a language** — `packages/ui/messages/{locale}.json` + register in i18n config
- **Custom org roles** — `POST /orgs/:orgId/roles` with a `permissions` array

---

## API overview

Condensed map of common endpoints. Full surface: Swagger at `/docs` (dev) or
[`docs/api-reference.md`](./docs/api-reference.md).

```
# Auth
POST   /auth/register · /auth/login · /auth/logout
POST   /auth/token/refresh
GET    /auth/me                                   (auth)
GET    /auth/oauth/:provider · /auth/oauth/:provider/callback
POST   /auth/magic-link/send · /auth/magic-link/verify
POST   /auth/passkey/register/options|verify      (auth)
POST   /auth/passkey/authenticate/options|verify
POST   /auth/mfa/totp/setup|verify · /auth/mfa/otp/send|verify

# Sessions, orgs, keys, billing
GET    /sessions · DELETE /sessions/:id           (auth)
GET/POST /orgs · /orgs/:orgId/members|invites|roles
GET/POST/DELETE /api-keys                          (auth)
POST   /billing/checkout|portal · POST /billing/webhook (Stripe)
GET    /billing/pricing · POST /billing/tax/quote

# Search, wallet, compliance
GET    /search
GET    /wallet · GET /wallet/transactions
GET    /compliance/soc2/readiness · /compliance/risk-assessment/:year

# Ops
GET    /status        (public status page data)
GET    /health · /healthz · /metrics (Prometheus)
```

Generated SDK: [`packages/client`](./packages/client/README.md)

---

## Testing & code quality

```bash
bun run test            # Vitest (API + packages/ui plain-logic tests)
bun run test:watch      # watch mode
bun run test:coverage   # coverage report
bun run test:integration:containers # pinned Postgres + Redis via Testcontainers
bun run email:dev       # production email templates at localhost:3001
bun run lint            # Biome lint
bun run lint:fix        # autofix (also runs on commit via Husky)
bun run type-check      # tsc --noEmit
bun run verify:generated # SDK + API docs drift check
```

CI runs lint, type-check, tests, generated-output drift checks, and the UI
build on every push/PR to `main`.

The Testcontainers command starts one PostgreSQL and one Redis container for the
run, applies the migration chain, and tears both down afterward. It requires a
running Docker-compatible container runtime; ordinary unit tests do not.

The email gallery imports the same components used for production delivery and
supplies synthetic preview data. It never reads runtime secrets.

> Set `HIBP_CHECK_ENABLED=false` for fully offline test runs (breach check hits the network by default).

---

## Production deployment

zerotrust runs anywhere Bun runs. Typical layout:

1. **Build** — `bun install && bun run db:migrate && bun run build`
2. **API** — `WORKER_MODE=true` + PM2/cluster on `dist/src/api/server.js` (port 1337)
3. **Worker** — exactly one `dist/worker.js` instance for BullMQ consumers
4. **UI** — `npm run build && npm start` in `packages/ui` (port 3000)
5. **Proxy** — separate TLS vhosts for API and UI; do not collapse both onto one port

WebAuthn requires matching `WEBAUTHN_RP_ID` and `WEBAUTHN_RP_ORIGINS` to your
production domain.

> **Step-by-step:** [`docs/deployment.md`](./docs/deployment.md) (CI/CD, staging + production deploy workflows, k6/ZAP gates)

---

## Project status

zerotrust is actively maintained with a large test suite. Honest boundaries:

| Ships today                             | Not yet / partial                                                 |
| --------------------------------------- | ----------------------------------------------------------------- |
| Google, GitHub, Facebook, Apple OAuth     | —                                                                 |
| Software key provider (CSFLE, tokens)   | TPM / Secure Enclave / PKCS#11 (fork path — see `docs/extending.md`) |
| Web + API                               | Expo mobile client (documented in security baseline, not in repo) |
| SOC 2 readiness docs + product controls | Auditor certification (your process)                              |

| Doc                                                              | Purpose                                 |
| ---------------------------------------------------------------- | --------------------------------------- |
| [`docs/production-checklist.md`](./docs/production-checklist.md) | Production-readiness sign-off checklist |
| [`docs/project/shipped.md`](./docs/project/shipped.md)           | Everything that ships today             |
| [`docs/project/todo.md`](./docs/project/todo.md)                 | Open backlog                           |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)                 | System architecture deep dive           |

---

## Contributing

1. Branch off `main` — **do not push directly to `main`**
2. Commits follow [Conventional Commits](https://www.conventionalcommits.org) (semantic-release)
3. Keep `bun run lint` and `bun run type-check` green; add Vitest tests for behavior changes
4. Open a PR to `main`; CI must pass

---

## Support

If zerotrust saves you time, consider supporting ongoing development:

- [Buy Me a Coffee](https://buymeacoffee.com/masyasinarafat)
- [Ko-fi](https://ko-fi.com/masyasinarafat)

---

## License

[MIT](#license) — use it for anything, commercial or otherwise.
