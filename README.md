<div align="center">

# zerotrust

**Production-grade authentication & identity platform — batteries included.**

A full-stack auth foundation you can clone, brand, and ship: a Hono + TypeScript API
and a Next.js dashboard/admin app, with passkeys, OAuth, SSO, MFA, RBAC/ABAC,
organizations, billing, and an audit trail already wired together.

[![CI](https://github.com/ALFAMAS/zerotrust/actions/workflows/ci.yml/badge.svg)](https://github.com/ALFAMAS/zerotrust/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178c6?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-1.x-black?logo=bun&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-4-e36002)

</div>

---

## Table of contents

- [Why zerotrust](#why-zerotrust)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Quick start (local development)](#quick-start-local-development)
- [Configuration](#configuration)
- [Testing & code quality](#testing--code-quality)
- [Production deployment](#production-deployment)
- [API overview](#api-overview)
- [Project structure](#project-structure)
- [Customizing](#customizing)
- [Security](#security)
- [Project status](#project-status)
- [Contributing](#contributing)
- [License](#license)

---

## Why zerotrust

Authentication is the part of every SaaS that is high-stakes, time-consuming, and
easy to get subtly wrong. zerotrust gives you a complete, opinionated implementation
of the hard parts — token issuance, session lifecycle, MFA, SSO, RBAC, abuse
defense, and an admin surface — so you can spend your time on product instead of
rebuilding login for the hundredth time.

- **Secure by default** — PASETO v4 tokens (no JWT footguns), bcrypt password
  hashing, client-side field encryption (CSFLE), HaveIBeenPwned breach checks, and
  per-IP credential-stuffing defense are on out of the box.
- **Enterprise-ready** — OIDC provider, SAML 2.0, SCIM 2.0, LDAP sync, and
  per-org security policies are first-class, not afterthoughts.
- **Operable** — Prometheus metrics, OpenTelemetry tracing, a public status page,
  structured logs, and Slack/Teams/PagerDuty alerting ship with the platform.

> The authoritative, always-current feature catalog lives in
> [`tdone.md`](./tdone.md). The list below is a curated summary.

---

## Features

### Authentication & identity

- Email + password with configurable account lockout
- OAuth — Google, GitHub, Apple, Facebook (admin-toggleable per provider)
- Magic links (passwordless, 15-minute TTL)
- Passkeys / WebAuthn (FIDO2, resident keys, MDS3 attestation policy)
- TOTP, Email OTP, SMS & WhatsApp OTP (Twilio), Telegram OTP
- PASETO v4 access tokens + rotating, hashed refresh tokens
- Session management — list, revoke, device fingerprinting, concurrent-session caps

### Enterprise & federation

- OIDC provider + SAML 2.0 SSO
- SCIM 2.0 user provisioning · LDAP / Active Directory sync
- Identity federation (RFC 8693 token exchange) with an admin provider registry
- Workload / agent identity — scoped client-credential tokens
- Decentralized identity — `did:key` / `did:web` resolver + proof-of-control
- Organizations & teams — workspaces, invites, custom roles with fine-grained permissions
- Cross-tenant JIT access — request + admin-approval inbox, auto-expiring
- MCP OAuth authorization server plus agentic delegation with human approval gates

### Access control & abuse defense

- RBAC + ABAC with just-in-time privilege escalation
- Continuous access evaluation — re-verification after sensitive operations
- Anomaly detection — unusual location / time / device
- Rate limiting — Redis-backed sliding window with in-memory fallback
- Credential-stuffing defense, account-takeover detection, optional signup proof-of-work

### Billing & growth

- Stripe billing — checkout, customer portal, webhooks, per-org subscriptions
- Plan feature gates (`requirePlan()`), 14-day trials, dunning, win-back, cancellation flow
- API key management — named keys, SHA-256 hashed, scopes, revoke
- Multi-currency pricing, PPP discounts, tax quotes, VAT validation, and tax exemptions
- Wallet, loyalty tiers, points ledger, redemption catalog, and referral tracking

### Frontend (Next.js)

- Landing page, user dashboard, and guarded admin panel in one app
- Admin consoles — users, revenue, sessions, auth settings, federation, JIT,
  agent approvals (human-in-the-loop), and SOC 2 / risk compliance
- PWA — installable, offline app-shell, web push (VAPID)
- i18n (next-intl, EN/ES/FR/AR with RTL support), locale-aware `Intl.*` formatting, dark mode
- GDPR — cookie consent, data export, 30-day soft-delete; privacy/terms pages
- Notification center (SSE real-time + email fallback), feedback widget, product tour
- Command palette, shared notes, team activity feed, mentions, and presence

### Compliance & operations

- Tamper-evident audit log (SHA-256 hash-chain) + Elasticsearch + SIEM fan-out
- Access reviews tooling, data-retention auto-purge
- SOC 2 readiness controls, risk register, privacy records, and compliance runbooks
- Prometheus metrics, OpenTelemetry tracing, public `/status` page
- S3-compatible storage (AWS S3, Backblaze B2, Cloudflare R2, MinIO, Wasabi) for
  backups and user uploads
- Automated `pg_dump` backups with local + S3 retention
- SLO burn-rate reporting, read-replica support, k6 load/chaos harnesses

---

## Tech stack

| Layer         | Technology                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------- |
| API           | [Hono](https://hono.dev) 4 · TypeScript 5 · run on [Bun](https://bun.sh)                    |
| Database      | PostgreSQL via [Drizzle ORM](https://orm.drizzle.team) (works with Neon)                    |
| Cache / queue | Redis (ioredis) · [BullMQ](https://docs.bullmq.io) email queue                              |
| Frontend      | [Next.js](https://nextjs.org) 16 (App Router) · Tailwind CSS · shadcn/ui                    |
| Crypto        | PASETO v4, `@noble/*`, ML-KEM (post-quantum KEM), CSFLE field encryption                    |
| Auth libs     | `@simplewebauthn/server` (WebAuthn) · `samlify` (SAML) · `otpauth` (TOTP)                   |
| Observability | Prometheus (`prom-client`) · OpenTelemetry · Sentry                                         |
| SDK           | Generated TypeScript client in `packages/client` from `src/api/openapi.json`                |
| Tooling       | [Biome](https://biomejs.dev) (lint+format) · Vitest · Playwright · Husky · semantic-release |

---

## Architecture

zerotrust is a Bun monorepo: a standalone API server and a Next.js app that talks to it.

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  Next.js app (port 3000) │  HTTP   │   Hono API (port 1337)    │
│  landing · dashboard ·   │ ──────▶ │   src/api/server.ts       │
│  admin · PWA             │         │   auth · orgs · billing…  │
└─────────────────────────┘         └────────────┬─────────────┘
                                                  │
                          ┌───────────────────────┼───────────────────────┐
                          ▼                        ▼                        ▼
                   PostgreSQL (5432)        Redis (6379)         Elasticsearch (9200, opt.)
                   Drizzle ORM              sessions/rate-limit  audit log (optional)
                                            /BullMQ queue
```

| Service             | Local URL                  | Notes                                  |
| ------------------- | -------------------------- | -------------------------------------- |
| API server          | http://localhost:1337      | `PORT` env (default **1337**)          |
| Next.js app + admin | http://localhost:3000      | admin panel at `/admin`                |
| API docs (Swagger)  | http://localhost:1337/docs | dev only                               |
| Health / metrics    | `/healthz` · `/metrics`    | on the API port                        |
| PostgreSQL          | localhost:5432             | or a managed provider (e.g. Neon)      |
| Redis               | localhost:6379             | optional — in-memory fallback if unset |

---

## Quick start (local development)

**Prerequisites:** [Bun](https://bun.sh) 1.x · PostgreSQL 15+ (local or a managed
URL like Neon) · Redis 7 (optional).

```bash
# 1. Clone
git clone https://github.com/ALFAMAS/zerotrust my-app
cd my-app

# 2. Install all workspaces (API + packages/ui)
bun install

# 3. Configure environment
cp .env.example .env
```

Generate the two required secrets and paste them into `.env`:

```bash
openssl rand -hex 32   # → TOKEN_SECRET_HEX
openssl rand -hex 32   # → CSFLE_MASTER_KEY_HEX
```

Set `DATABASE_URL` (and `REDIS_URI` if you have Redis). Everything else has working
local defaults.

```bash
# 4. Create the schema
bun run db:push          # fast dev sync; use db:migrate for versioned migrations

# 5. Run API + UI together (hot reload on both)
bun run dev
```

- API → **http://localhost:1337**
- App → **http://localhost:3000**

Point the UI at the API by setting `NEXT_PUBLIC_ZEROTRUST_URL=http://localhost:1337`
in `packages/ui/.env.local`.

Run them individually if you prefer:

```bash
bun run dev:api    # API only (port 1337)
bun run dev:ui     # UI only (port 3000, also starts the Next.js MCP server)
```

### Create your first admin

```bash
curl -X POST http://localhost:1337/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!","displayName":"Admin"}'
```

Then grant the admin role in the database:

```sql
UPDATE users SET roles = array_append(roles, 'admin') WHERE email = 'admin@example.com';
```

Log in at **http://localhost:3000/login** — the admin panel is at **/admin**.

---

## Configuration

All variables are documented inline in [`.env.example`](./.env.example). The most
important ones:

| Variable                | Required | Default                  | Description                                        |
| ----------------------- | -------- | ------------------------ | -------------------------------------------------- |
| `TOKEN_SECRET_HEX`      | ✅       | —                        | 32-byte hex — signs PASETO v4 tokens               |
| `CSFLE_MASTER_KEY_HEX`  | ✅       | —                        | 32-byte hex — client-side field encryption         |
| `DATABASE_URL`          | ✅       | —                        | PostgreSQL connection string                       |
| `REDIS_URI`             |          | `redis://localhost:6379` | Sessions, rate limiting, queue (has fallback)      |
| `PORT`                  |          | `1337`                   | API listen port                                    |
| `API_BASE_URL`          |          | `http://localhost:1337`  | Public API URL                                     |
| `NODE_ENV`              |          | `development`            | `development` or `production`                      |
| `WEBAUTHN_RP_ID`        |          | `localhost`              | **Must** match your domain in production           |
| `WEBAUTHN_RP_ORIGINS`   |          | `http://localhost:1337`  | Allowed WebAuthn origins                           |
| `MAIL_HOST` / `MAIL_*`  |          | —                        | SMTP — required for magic links & email OTP        |
| `OAUTH_<PROVIDER>_*`    |          | —                        | OAuth client id/secret/redirect (per provider)     |
| `STRIPE_SECRET_KEY`     |          | —                        | Enables billing endpoints when set                 |
| `ELASTICSEARCH_*`       |          | disabled                 | Audit-log storage (off by default)                 |
| `BACKUP_S3_*`           |          | —                        | S3-compatible backups & uploads (see below)        |
| `BACKUP_ENCRYPTION_KEY` |          | —                        | AES-256-GCM encryption key/passphrase for DB dumps |

**Frontend** (`packages/ui/.env.local`):

| Variable                        | Description                                 |
| ------------------------------- | ------------------------------------------- |
| `NEXT_PUBLIC_ZEROTRUST_URL`     | Backend API base URL (no trailing slash)    |
| `NEXT_PUBLIC_APP_NAME`          | App name shown in UI, emails, and meta tags |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`  | Plausible Analytics domain (consent-gated)  |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics 4 ID (consent-gated)       |
| `NEXT_PUBLIC_SENTRY_DSN`        | Sentry DSN for browser error capture        |

### S3-compatible storage (optional)

zerotrust uses one provider-agnostic adapter for both DB backups (`backups/` prefix)
and user uploads such as avatars (`uploads/` prefix). Set `BACKUP_S3_BUCKET` plus
credentials to enable; `BACKUP_S3_ENDPOINT` + `BACKUP_S3_FORCE_PATH_STYLE=true` switch
to Backblaze B2 / MinIO / R2. When unset, backups stay local and avatars fall back to
local disk. Set `BACKUP_ENCRYPTION_KEY` (or `BACKUP_ENCRYPTION_KEY_HEX`) to encrypt DB dumps before local retention or S3 upload; use `BACKUP_REQUIRE_ENCRYPTION=true` in production to fail closed rather than write plaintext dumps. See the `BACKUP_S3_*`, `BACKUP_ENCRYPTION_*`, and `UPLOADS_S3_*` blocks in `.env.example`.

---

## Testing & code quality

```bash
bun run test            # run the Vitest suite
bun run test:watch      # watch mode
bun run test:coverage   # coverage report

bun run lint            # Biome lint (check only)
bun run lint:fix        # Biome autofix (lint + format) — also runs on commit via Husky
bun run type-check      # tsc --noEmit
```

Tests live in `src/__tests__/`. CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml))
runs lint, type-check, the test suite, and the UI build on every push and PR to `main`.

> Note: the HaveIBeenPwned breach check is enabled by default and reaches the network
> during `register` tests. Set `HIBP_CHECK_ENABLED=false` for fully offline test runs.

---

## Production deployment

zerotrust runs anywhere Bun and Node run. The reference setup below is **Ubuntu 22.04**
with PM2 + nginx; managed PostgreSQL/Redis (e.g. Neon + Upstash) is recommended over
self-hosting the data stores.

### 1. System dependencies

```bash
apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx ufw
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
npm install -g pm2
```

(If self-hosting data stores: `apt install -y postgresql redis-server` and create a
`zerotrust` database/user + a Redis password.)

### 2. Clone, configure, build

```bash
useradd -m -s /bin/bash zerotrust && su - zerotrust
git clone https://github.com/ALFAMAS/zerotrust /home/zerotrust/app
cd /home/zerotrust/app

cp .env.example .env
# Set at minimum: TOKEN_SECRET_HEX, CSFLE_MASTER_KEY_HEX, DATABASE_URL, REDIS_URI,
# NODE_ENV=production, API_BASE_URL, and the WEBAUTHN_RP_* values for your domain.

bun install
bun run db:migrate     # apply versioned migrations
bun run build          # compile the API to dist/
```

> **WebAuthn:** `WEBAUTHN_RP_ID` must equal your registrable domain (e.g.
> `yourdomain.com`) and `WEBAUTHN_RP_ORIGINS` must list the exact HTTPS origin, or
> passkeys will fail to register/authenticate.

### 3. Run with PM2

```bash
# API (port 1337) — cluster mode
pm2 start dist/api/server.js --name zerotrust-api -i max

# UI (Next.js, port 3000)
cd packages/ui
echo "NEXT_PUBLIC_ZEROTRUST_URL=https://api.yourdomain.com" > .env.local
npm run build
pm2 start npm --name zerotrust-ui -- start

pm2 save && pm2 startup    # run the printed command to enable boot persistence
```

### 4. nginx reverse proxy

Two server blocks — the **API on 1337**, the **UI on 3000** (do not point both at the
same port):

```nginx
# /etc/nginx/sites-available/zerotrust-api  →  api.yourdomain.com
server {
    server_name api.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:1337;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;   # keep SSE / web-push streams open
    }
}

# /etc/nginx/sites-available/zerotrust-ui  →  yourdomain.com
server {
    server_name yourdomain.com www.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/zerotrust-api /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/zerotrust-ui  /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
```

### 5. TLS

```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
certbot --nginx -d api.yourdomain.com
```

### Deploying updates

```bash
cd /home/zerotrust/app && git pull
bun install && bun run db:migrate && bun run build && pm2 restart zerotrust-api
cd packages/ui && npm install && npm run build && pm2 restart zerotrust-ui
```

---

## API overview

A condensed map of the most-used endpoints (auth-gated routes noted). The API mounts
31 route modules in `src/api/server.ts`; browse Swagger at `/docs` (dev) for the full
surface.

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

# Enterprise / federation
/scim/v2/*   (SCIM)   ·   /ldap/*   ·   /federation/*
OIDC discovery + SAML endpoints mounted at /
GET /jwks · /.well-known/*

# Collaboration, search, wallet, compliance
GET    /collab/search · /collab/activity · /collab/presence/:orgId
GET/POST/PUT/DELETE /collab/notes[/:id]
GET    /search · /search/smart · /search/provider
GET    /wallet · /wallet/tier · /wallet/referrals/dashboard
GET    /compliance/soc2/readiness · /compliance/risk-assessment/:year

# AI-native / agentic auth
GET    /.well-known/oauth-authorization-server
GET    /mcp/authorize · POST /mcp/token
POST   /agentic/auth/delegation/exchange

# Ops
GET    /status        (public status page data)
GET    /health · /healthz · /metrics (Prometheus)
```

---

## Project structure

```
.
├── src/                            # API (Hono + TypeScript + Drizzle)
│   ├── api/
│   │   ├── server.ts               # Hono app + route mounting (port 1337)
│   │   └── routes/                 # auth, mfa, passkey, admin, orgs, billing, wallet, search…
│   ├── db/                         # Drizzle schema + connection (PostgreSQL)
│   ├── services/                   # token, email, MFA, OAuth, objectStorage, dbBackup…
│   ├── middleware/                 # auth, rate limiting, CSRF, requirePlan, apiKeyAuth…
│   ├── oidc/ · saml/ · scim/ · ldap/ · federation/ · did/ · jit/   # enterprise modules
│   ├── audit/ · metrics/ · webhooks/ · workload/                   # ops + platform modules
│   ├── crypto/                     # PASETO, CSFLE, hardware key store, post-quantum KEM
│   └── __tests__/                  # Vitest unit + integration tests
├── packages/
│   ├── client/                     # generated dependency-free TypeScript SDK
│   └── ui/                         # Next.js 16 app (port 3000)
│       ├── messages/               # i18n JSON (en, es, fr, ar)
│       └── src/
│           ├── app/                # App Router: (auth)/, dashboard/, admin/, blog/, …
│           ├── components/         # shared UI components
│           └── lib/                # API client, auth tokens, helpers
├── drizzle/                        # SQL migrations + journal
├── docs/compliance/                # compliance policies, runbooks, and evidence templates
├── scripts/                        # db-backup, db-restore, postinstall…
├── .github/workflows/ci.yml        # CI: lint + type-check + test + UI build
├── .env.example                    # all env vars, documented inline
└── tdone.md                        # shipped feature catalog + latest audit snapshot
```

---

## Customizing

**Rename the app** — replace `zerotrust` across `packages/ui/src/` (start with
`app/layout.tsx` metadata and `app/page.tsx`) and set `NEXT_PUBLIC_APP_NAME`.

**Add an API route**

```typescript
// src/api/server.ts
import myRoutes from "./routes/my.routes";
app.route("/my-feature", myRoutes); // add authMiddleware inside the module
```

**Read the current user** (any handler after `authMiddleware`):

```typescript
const user = c.get("user");
const isAdmin = user.roles.includes("admin");
```

**Custom org roles** — `POST /orgs/:orgId/roles` with a `permissions` array. Available
permissions: `members:read|invite|manage`, `billing:view|manage`,
`settings:view|manage`, `audit:view`, `roles:manage`, `invites:manage`.

**Toggle auth methods** — Admin panel → **Auth Settings**; changes are live, no restart.

**Add a language** — create `packages/ui/messages/{locale}.json`, then register the
locale in `src/i18n/request.ts` and the `LocaleSwitcher` component.

---

## Security

- **Tokens** — PASETO v4 (AES-256-GCM), 1-hour access TTL; refresh tokens are
  SHA-256-hashed and rotated on use.
- **At rest** — client-side field-level encryption (CSFLE) for sensitive columns with
  key-version rotation; bcrypt password hashing.
- **Abuse defense** — per-account lockout, per-IP credential-stuffing throttle,
  HaveIBeenPwned breach checks on register/password-change, optional signup PoW.
- **Audit** — tamper-evident SHA-256 hash-chained audit log, optional Elasticsearch +
  SIEM streaming.
- **Disclosure** — `/.well-known/security.txt` (RFC 9116); set `SECURITY_CONTACT`.
  Report vulnerabilities per [`SECURITY.md`](./SECURITY.md) — please do not open public
  issues for security reports.

Rotating `TOKEN_SECRET_HEX` / `CSFLE_MASTER_KEY_HEX` is supported via a dual-key
(accept-old, sign-new) transition window; rotate, deploy, wait for old tokens to
expire, then drop the old key.

---

## Project status

zerotrust tracks its state in the repository docs:

| Doc                                              | What it covers                                              |
| ------------------------------------------------ | ----------------------------------------------------------- |
| [`tdone.md`](./tdone.md)                         | Everything that ships today, plus the latest codebase audit |
| [`docs/compliance`](./docs/compliance/README.md) | Compliance policies, procedures, and evidence templates     |
| [`packages/client`](./packages/client/README.md) | Generated TypeScript SDK package and usage notes            |

Latest audit note (2026-06-24): a clean `bun install` restores a fully working
tree — `bun run lint:ci`, `bun run type-check`, the 677-test suite, and the UI
build all pass. The earlier "broken workspace links" blocker is resolved, and the
CI lint job (which previously crashed on Linux for a missing Biome binary) now
runs. See the production-hardening audit snapshot at the bottom of
[`tdone.md`](./tdone.md) for the full list of security fixes and findings.

---

## Contributing

1. Branch off `main` — **do not push directly to `main`**.
2. Commits follow [Conventional Commits](https://www.conventionalcommits.org)
   (enforced by commitlint; releases are automated via semantic-release).
3. Biome runs on commit via Husky — keep `bun run lint` and `bun run type-check` green.
4. Add/adjust Vitest tests for behavior changes.
5. Open a PR to `main`; CI must pass.

---

## License

[MIT](#license) — use it for anything, commercial or otherwise.
