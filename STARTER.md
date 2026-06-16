# ZeroAuth — SaaS Starter

A production-ready SaaS boilerplate with enterprise-grade authentication, billing, and developer tools built in. Drop in your business logic and ship.

**Stack:** Hono + TypeScript + PostgreSQL (Drizzle ORM) + Redis · Next.js 16.2 + React 19 + Tailwind CSS

---

## What's already built

|     | Feature                      | Notes                                                              |
| --- | ---------------------------- | ------------------------------------------------------------------ |
| ✅  | Email + password auth        | Register, login, forgot password, account lockout                  |
| ✅  | Google & GitHub OAuth        | Toggle on/off from admin panel                                     |
| ✅  | Apple & Facebook OAuth       | Toggle on/off from admin panel                                     |
| ✅  | Magic links                  | Passwordless email login (15-min TTL)                              |
| ✅  | Passkeys / WebAuthn (FIDO2)  | Biometric and hardware key support, resident keys                  |
| ✅  | TOTP (authenticator app)     | Google Authenticator, 1Password, Authy                             |
| ✅  | Email OTP                    | One-time codes delivered via email                                 |
| ✅  | SMS OTP                      | Twilio-backed                                                      |
| ✅  | WhatsApp & Telegram OTP      | Via Twilio                                                         |
| ✅  | Session management           | List active sessions, revoke any, device fingerprinting            |
| ✅  | PASETO v4 access tokens      | AES-256-GCM signed; no JWT footguns                                |
| ✅  | Refresh tokens               | Long-lived, hashed, rotated on use                                 |
| ✅  | RBAC + ABAC                  | Roles, permissions, JIT privilege escalation                       |
| ✅  | Continuous access evaluation | Re-verification challenges, session re-check after sensitive ops   |
| ✅  | Anomaly detection            | Flag unusual login location, time, device                          |
| ✅  | Rate limiting                | Per-IP, Redis-backed with in-memory fallback                       |
| ✅  | OIDC provider                | Full OpenID Connect server                                         |
| ✅  | SAML 2.0 SSO                 | SP-initiated SSO for Okta, Azure AD, Google Workspace              |
| ✅  | SCIM 2.0                     | Auto-provision/deprovision users from IdP                          |
| ✅  | LDAP / Active Directory sync |                                                                    |
| ✅  | Organizations & teams        | Workspaces, invite flows, org roles, transfer ownership            |
| ✅  | Custom org roles             | Fine-grained resource permissions defined per org                  |
| ✅  | API key management           | Named keys, SHA-256 hashed, scopes, per-user or per-org, revoke    |
| ✅  | Stripe billing               | Checkout, customer portal, webhook handler                         |
| ✅  | Plan feature gates           | `requirePlan()` middleware (free / pro / enterprise)               |
| ✅  | Billing dashboard            | Plan cards, Stripe checkout, manage subscription button            |
| ✅  | User dashboard               | Profile, security, sessions, orgs, API keys, billing               |
| ✅  | Admin panel                  | Users, sessions, audit log, auth toggles — at `/admin`             |
| ✅  | Notification center          | Bell icon, SSE real-time delivery                                  |
| ✅  | Notification preferences     | Users choose which notifications they receive                      |
| ✅  | Unsubscribe tokens           | One-click CAN-SPAM unsubscribe with HMAC-SHA256 tokens             |
| ✅  | Email queue                  | BullMQ + Redis — non-blocking transactional delivery               |
| ✅  | Avatar upload                | JPEG / PNG / GIF / WebP, 5 MB limit                                |
| ✅  | In-app NPS / feedback widget | Thumbs up/down with per-feature context                            |
| ✅  | Help center                  | `/help` searchable FAQ with category filter                        |
| ✅  | Onboarding setup checklist   | Dismissable progress widget on dashboard                           |
| ✅  | Blog + Changelog             | Static pages at `/blog` and `/changelog`                           |
| ✅  | Analytics                    | Plausible and GA4 with consent gate                                |
| ✅  | Sentry                       | Error boundaries + server-side exception capture                   |
| ✅  | i18n                         | next-intl, locale detection, language switcher (EN / ES / FR)      |
| ✅  | Data retention               | Auto-purge audit logs, sessions, OTPs after configurable intervals |
| ✅  | Audit log                    | Immutable event trail to Elasticsearch                             |
| ✅  | Prometheus metrics           | `/metrics` endpoint                                                |
| ✅  | OpenTelemetry tracing        | OTLP exporter, auto-instrumentation                                |
| ✅  | Dark mode                    | System preference + manual override, persisted                     |
| ✅  | Toast notifications          | Global context for success / error feedback                        |
| ✅  | Loading skeletons            | Skeleton screens for better perceived performance                  |
| ✅  | Mobile-responsive            | All pages usable on phone                                          |
| ✅  | PWA manifest                 | `manifest.json`, service worker, installable on mobile             |
| ✅  | Cookie consent               | GDPR-compliant accept / reject banner                              |
| ✅  | Privacy policy + Terms       | Content driven by `NEXT_PUBLIC_*` env vars                         |
| ✅  | GDPR export + deletion       | "Export my data" JSON + 30-day soft-delete grace period            |
| ✅  | Docker Compose               | Full stack in one command                                          |
| ✅  | GitHub Actions CI            | Lint + type-check + test + UI build on every push                  |
| ✅  | Railway / Render deploy      | One-click deploy buttons in README                                 |
| ✅  | Secret rotation              | Zero-downtime procedure documented in README                       |

---

## Quick start

### Option A — Docker (recommended, zero local setup)

**Prerequisites:** Docker Desktop installed and running.

```bash
# Clone
git clone https://github.com/ALFAMAS/zeroauth my-saas && cd my-saas

# Generate secrets
openssl rand -hex 32   # copy → TOKEN_SECRET_HEX
openssl rand -hex 32   # copy → CSFLE_MASTER_KEY_HEX

# Configure
cp .env.example .env
nano .env   # paste in the two secrets above

# Start full stack
docker compose up -d

# Tail logs until healthy
docker compose logs -f zeroauth
# Look for: Server listening on http://localhost:3000
```

App: http://localhost:3000 · API: http://localhost:3000 · Admin: http://localhost:3000/admin

Stop: `docker compose down` · Wipe all data: `docker compose down -v`

---

### Option B — Local dev (no Docker)

**Prerequisites:** Node.js 20+ or Bun 1.x · PostgreSQL 15+ · Redis 7 (optional, falls back to in-memory rate limiting)

```bash
git clone https://github.com/ALFAMAS/zeroauth my-saas && cd my-saas
bun install
cp .env.example .env
# Edit .env — minimum required: DATABASE_URL, TOKEN_SECRET_HEX, CSFLE_MASTER_KEY_HEX
bun run db:migrate
bun run dev        # starts API (port 3000) + UI (port 3000) with hot reload
```

Individual processes: `bun run dev:api` · `bun run dev:ui`

---

### Create your first admin

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!","displayName":"Admin"}'

# Grant admin role (Docker)
docker exec -it zeroauth-postgres psql -U zeroauth -d zeroauth \
  -c "UPDATE users SET roles = array_append(roles, 'admin') WHERE email = 'admin@example.com';"

# Grant admin role (local)
psql -U postgres -d zeroauth \
  -c "UPDATE users SET roles = array_append(roles, 'admin') WHERE email = 'admin@example.com';"
```

Log in at http://localhost:3000/login · Admin panel: http://localhost:3000/admin

---

## Environment variables

### API (`/.env`)

| Variable                      | Required | Default               | Description                                            |
| ----------------------------- | -------- | --------------------- | ------------------------------------------------------ |
| `TOKEN_SECRET_HEX`            | ✅       | —                     | 32-byte hex for PASETO tokens (`openssl rand -hex 32`) |
| `CSFLE_MASTER_KEY_HEX`        | ✅       | —                     | 32-byte hex for field encryption                       |
| `DATABASE_URL`                | ✅       | —                     | PostgreSQL connection string                           |
| `REDIS_URI`                   |          | —                     | Redis URL (falls back to in-memory)                    |
| `PORT`                        |          | 3000                  | API listen port                                        |
| `NODE_ENV`                    |          | development           | `development` or `production`                          |
| `API_BASE_URL`                |          | http://localhost:3000 | Public API URL                                         |
| `APP_URL`                     |          | http://localhost:3000 | Public frontend URL                                    |
| `UNSUBSCRIBE_SECRET`          |          | —                     | 32+ char secret for CAN-SPAM unsubscribe tokens        |
| `SENTRY_DSN`                  |          | —                     | Sentry DSN for server-side error capture               |
| `STRIPE_SECRET_KEY`           |          | —                     | Stripe secret key (`sk_live_…` or `sk_test_…`)         |
| `STRIPE_WEBHOOK_SECRET`       |          | —                     | Stripe webhook signing secret (`whsec_…`)              |
| `STRIPE_PRODUCT_PRO`          |          | —                     | Stripe product ID for the Pro plan                     |
| `STRIPE_PRODUCT_ENTERPRISE`   |          | —                     | Stripe product ID for the Enterprise plan              |
| `OAUTH_GOOGLE_CLIENT_ID`      |          | —                     | Google OAuth app client ID                             |
| `OAUTH_GOOGLE_CLIENT_SECRET`  |          | —                     | Google OAuth app client secret                         |
| `OAUTH_GITHUB_CLIENT_ID`      |          | —                     | GitHub OAuth app client ID                             |
| `OAUTH_GITHUB_CLIENT_SECRET`  |          | —                     | GitHub OAuth app client secret                         |
| `MAIL_HOST`                   |          | —                     | SMTP host (e.g. `smtp.gmail.com`)                      |
| `MAIL_PORT`                   |          | 587                   | SMTP port                                              |
| `MAIL_USER`                   |          | —                     | SMTP username                                          |
| `MAIL_PASSWORD`               |          | —                     | SMTP password                                          |
| `MAIL_FROM`                   |          | —                     | Sender address (`noreply@yourapp.com`)                 |
| `TWILIO_ACCOUNT_SID`          |          | —                     | SMS / WhatsApp / Telegram OTP                          |
| `TWILIO_AUTH_TOKEN`           |          | —                     | SMS / WhatsApp / Telegram OTP                          |
| `TWILIO_PHONE_NUMBER`         |          | —                     | Twilio sender number                                   |
| `WEBAUTHN_RP_ID`              |          | localhost             | Must match your domain in production                   |
| `WEBAUTHN_RP_ORIGINS`         |          | http://localhost:3000 | Allowed WebAuthn origins                               |
| `ELASTICSEARCH_HOST`          |          | localhost             | Audit log storage                                      |
| `OTEL_ENABLED`                |          | true                  | Set `false` to disable OpenTelemetry                   |
| `OTEL_EXPORTER_OTLP_ENDPOINT` |          | http://localhost:4318 | OTLP trace exporter endpoint                           |
| `LOG_LEVEL`                   |          | info                  | `debug` / `info` / `warn` / `error`                    |

### Frontend (`/packages/ui/.env.local`)

| Variable                        | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_ZEROAUTH_URL`      | Backend API base URL — no trailing slash          |
| `NEXT_PUBLIC_APP_NAME`          | App name shown in UI, emails, and meta tags       |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`  | Plausible Analytics domain (consent-gated)        |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics 4 measurement ID (consent-gated) |
| `NEXT_PUBLIC_SENTRY_DSN`        | Sentry DSN for browser error capture              |
| `SENTRY_DSN`                    | Sentry DSN for Next.js server components          |
| `NEXT_PUBLIC_STRIPE_PRICE_PRO`  | Stripe price ID displayed on the billing page     |

Full list with comments: [`.env.example`](./.env.example) · [`packages/ui/.env.example`](./packages/ui/.env.example)

---

## Project structure

```
.
├── src/                                    # API backend (Hono + TypeScript)
│   ├── api/
│   │   ├── server.ts                       # Hono app entry point, route mounting
│   │   └── routes/
│   │       ├── auth.routes.ts              # Register, login, OAuth, token refresh
│   │       ├── magic-link.routes.ts        # Magic link send + verify
│   │       ├── password-reset.routes.ts    # Forgot / reset password
│   │       ├── mfa.routes.ts               # TOTP, email/SMS OTP
│   │       ├── passkey.routes.ts           # WebAuthn register + authenticate
│   │       ├── session.routes.ts           # List + revoke sessions
│   │       ├── notification.routes.ts      # Notification center + SSE + preferences
│   │       ├── unsubscribe.routes.ts       # Email unsubscribe (CAN-SPAM)
│   │       ├── org.routes.ts               # Organizations, members, invites, roles
│   │       ├── api-keys.routes.ts          # API key CRUD
│   │       ├── billing.routes.ts           # Stripe checkout + portal + subscription
│   │       ├── gdpr.routes.ts              # Data export + account deletion
│   │       ├── feedback.routes.ts          # In-app NPS / thumbs feedback
│   │       ├── tenant.routes.ts            # Tenant / workspace management
│   │       ├── anomaly.routes.ts           # Anomaly detection events
│   │       ├── verification.routes.ts      # Continuous re-verification challenges
│   │       ├── workload.routes.ts          # Background job status
│   │       └── admin.routes.ts             # Users CRUD, settings, stats (admin only)
│   ├── db/
│   │   ├── schema.ts                       # Drizzle ORM schema (all tables)
│   │   └── index.ts                        # PostgreSQL connection pool
│   ├── middleware/
│   │   ├── auth.ts                         # Token verification, c.set("user")
│   │   ├── apiKeyAuth.ts                   # API key Bearer / X-API-Key auth
│   │   ├── requirePlan.ts                  # Plan feature gate middleware
│   │   ├── accountLockout.ts               # Failed-login tracking + auto-unlock
│   │   ├── rateLimiting.ts                 # Per-IP sliding window (Redis / memory)
│   │   └── continuousVerification.ts       # Re-verification session tracking
│   ├── services/
│   │   ├── token.service.ts                # PASETO sign + verify
│   │   ├── magicLink.service.ts            # Magic link generation + delivery
│   │   ├── anomalyDetection.ts             # Login anomaly scoring
│   │   └── unsubscribe.service.ts          # HMAC unsubscribe token logic
│   ├── models/
│   │   └── settings.model.ts               # App settings (cached from DB)
│   ├── mfa/
│   │   ├── totp.ts                         # TOTP helpers (otpauth)
│   │   └── resident-keys.ts                # FIDO2 discoverable credential helpers
│   ├── shared/
│   │   ├── plans.ts                        # Plan config (free/pro/enterprise) + feature gates
│   │   ├── permissions.ts                  # Org permission constants
│   │   └── types.ts                        # HonoEnv and shared TypeScript types
│   ├── telemetry/
│   │   └── tracer.ts                       # OpenTelemetry SDK init + withSpan helper
│   └── logger/
│       └── index.ts                        # Structured logger
├── packages/
│   └── ui/                                 # Next.js 16.2 / React 19 (port 3000)
│       ├── messages/                       # i18n JSON files (en.json, es.json, fr.json)
│       ├── sentry.client.config.ts         # Sentry browser config
│       ├── sentry.server.config.ts         # Sentry server config
│       ├── sentry.edge.config.ts           # Sentry edge config
│       └── src/
│           ├── app/
│           │   ├── layout.tsx              # Root layout — fonts, providers, Sentry
│           │   ├── page.tsx                # Landing page (hero, features, pricing)
│           │   ├── (auth)/                 # /login /register /forgot-password /callback
│           │   ├── invite/[token]/         # Org invite acceptance
│           │   ├── dashboard/              # /dashboard — user-facing pages
│           │   │   ├── page.tsx            # Dashboard overview + SetupChecklist
│           │   │   ├── profile/            # Display name, avatar, language
│           │   │   ├── security/           # Password, MFA, passkeys
│           │   │   ├── sessions/           # Active sessions list + revoke
│           │   │   ├── account/            # GDPR export + account deletion
│           │   │   ├── settings/           # Notification preferences
│           │   │   ├── organizations/      # Org list + org detail + settings
│           │   │   ├── api-keys/           # API key management UI
│           │   │   └── billing/            # Plan cards, checkout, manage subscription
│           │   ├── admin/                  # /admin — guarded by admin role
│           │   │   ├── page.tsx            # Stats dashboard
│           │   │   ├── users/              # User list + detail view
│           │   │   ├── sessions/           # Active session browser
│           │   │   ├── audit/              # Audit log viewer
│           │   │   └── settings/
│           │   │       ├── auth/           # Auth method toggle panel
│           │   │       └── general/        # App name, URL, branding
│           │   ├── blog/                   # /blog — index + post pages
│           │   ├── changelog/              # /changelog — versioned release notes
│           │   ├── help/                   # /help — searchable FAQ
│           │   ├── privacy/                # /privacy
│           │   └── terms/                  # /terms
│           ├── components/
│           │   ├── SetupChecklist.tsx      # Onboarding progress widget
│           │   ├── FeedbackWidget.tsx      # NPS / thumbs feedback
│           │   ├── LocaleSwitcher.tsx      # Language dropdown
│           │   ├── NotificationBell.tsx    # Bell icon + dropdown
│           │   ├── CookieConsent.tsx       # GDPR consent banner
│           │   └── ErrorBoundary.tsx       # React error boundary (Sentry)
│           └── data/
│               ├── blog-posts.ts           # Blog post metadata + content
│               ├── changelog.ts            # Release notes entries
│               └── faq.ts                  # Help center FAQ items
├── src/__tests__/                          # Vitest unit + integration tests
├── .github/workflows/ci.yml               # CI — lint, type-check, test, UI build
├── docker-compose.yml                      # Full stack (API + UI + PG + Redis + ES)
├── Dockerfile                              # Multi-stage production image
├── drizzle.config.ts                       # Drizzle ORM config
├── .env.example                            # All API env vars with descriptions
└── README.md                               # Deployment guide + API reference
```

---

## Customizing

### Rename the app

Replace `ZeroAuth` in these files:

```
packages/ui/src/app/layout.tsx               ← <title> and metadata
packages/ui/src/app/page.tsx                 ← landing page hero + navbar
packages/ui/src/app/dashboard/layout.tsx
packages/ui/src/app/admin/layout.tsx
```

Or set `NEXT_PUBLIC_APP_NAME` in `packages/ui/.env.local` — most UI strings read from this.

### Change the brand color

Edit `packages/ui/tailwind.config.js`:

```js
colors: {
  brand: "#your-hex",   // default: #6366f1 (indigo)
}
```

Then replace `indigo-` with `brand-` across the UI files.

### Add an API route

```typescript
// src/api/server.ts
import myRoutes from "./routes/my.routes";
app.route("/my-feature", authMiddleware, myRoutes);
```

### Read the current user in a route

```typescript
// Any handler after authMiddleware or apiKeyAuth
const user = c.get("user");
const isAdmin = user.roles.includes("admin");
const session = c.get("session");
```

### Gate a route by plan

```typescript
import { requirePlan } from "../../middleware/requirePlan";

// Blocks free-tier users with 403 PLAN_REQUIRED
router.get("/advanced-feature", authMiddleware, requirePlan("advancedAnalytics"), async (c) => {
  // ...
});
```

Plans and their feature flags live in `src/shared/plans.ts`.

### Add a custom org role

```
POST /orgs/:orgId/roles
{
  "name": "Billing Manager",
  "permissions": ["billing:view", "billing:manage"]
}
```

Available permissions: `members:read`, `members:invite`, `members:manage`, `billing:view`, `billing:manage`, `settings:view`, `settings:manage`, `audit:view`, `roles:manage`, `invites:manage`.

### Add a language

1. Create `packages/ui/messages/{locale}.json` (copy from `en.json`)
2. Add the locale to `SUPPORTED_LOCALES` in `src/i18n/request.ts`
3. Add the entry to the `LOCALES` array in `components/LocaleSwitcher.tsx`

### Toggle auth methods

Admin panel → **Auth Settings** → flip any toggle. Changes are live immediately — no restart needed.

### Enable error monitoring

Set `SENTRY_DSN` (backend) and `NEXT_PUBLIC_SENTRY_DSN` (frontend). The `ErrorBoundary` in `layout.tsx` automatically captures unhandled React errors.

---

## Tests

```bash
bun run test              # run all tests (Vitest)
bun run test:watch        # watch mode
bun run test:coverage     # with V8 coverage report
```

Tests live in `src/__tests__/`. CI runs them on every push to `main`.

---

## Update log

| Version | Date    | What changed                                                                                                                                                                                                                                             |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2025-01 | Email/password, OAuth (Google/GitHub), magic links, TOTP, session management, admin panel                                                                                                                                                                |
| 1.1     | 2025-02 | Passkeys / WebAuthn, RBAC/ABAC, continuous access evaluation, anomaly detection                                                                                                                                                                          |
| 1.2     | 2025-03 | Notification center (SSE), NPS feedback widget, BullMQ email queue, unsubscribe tokens                                                                                                                                                                   |
| 1.3     | 2025-04 | SAML 2.0 SSO, SCIM 2.0, LDAP sync, OIDC provider, org custom roles                                                                                                                                                                                       |
| 1.4     | 2025-05 | i18n (next-intl EN/ES/FR), Sentry, blog/changelog, analytics consent, PWA manifest                                                                                                                                                                       |
| 1.5     | 2025-06 | API key management, Stripe billing + webhooks, plan feature gates, help center, onboarding checklist                                                                                                                                                     |
| 1.6     | 2025-06 | Package upgrades: Next.js 16.2, React 19, @simplewebauthn/server v13, OTel resources v2, Stripe v22, Zod v4                                                                                                                                              |
| 1.7     | 2026-06 | HIBP breach check, new-device alerts, takeover detection, per-org billing, trials, dunning, win-back, usage metering, admin impersonation + revenue dashboard + broadcast, feature flags, webhooks UI, status page, DB backups, alerting, Jaeger tracing |
| 1.8     | 2026-06 | Frontend↔backend wiring: dashboard route guard + silent token refresh (`/auth/token/refresh`), GDPR export/delete pages wired to Bearer auth and linked in nav, disposable-email blocking confirmed live                                                |
| 1.9     | 2026-06 | Advanced-backend UIs: DID resolver/challenge (`/admin/did`), cross-tenant JIT request + approval inbox (`/dashboard/jit`, `/admin/jit`), workload/agent identity (`/admin/workload`), federation provider registry (`/admin/federation`)                  |
| 1.10    | 2026-06 | Shared responsive app shell (`components/app-shell/`) for dashboard + admin — collapsible sidebar + sticky topbar + footer, mobile drawer; workload credential list + revoke endpoints (`GET /workload/credentials`, `POST /workload/credentials/:id/revoke`) |
| 1.11    | 2026-06 | Durable cross-tenant JIT + federation: new `cross_tenant_jit_requests` and `federated_providers` tables (migration `0003`); both stores rewritten DB-backed (async) so grants, approvals and trusted providers survive restarts                          |

---

## Roadmap

Items are sorted by business impact and urgency. Complete P0 before launch; P1 within the first month; P2 within the first quarter.

---

### P0 — Launch blockers

Must complete before going live with paying customers.

**Infrastructure**

- [x] DB backup — `bun run db:backup` runs pg_dump with 30-day retention pruning and optional S3 upload; daily in-server scheduler via `BACKUP_ENABLED=true`
- [x] Environment parity — `.env.staging.example` mirrors production config shape (test-mode Stripe, sandbox mail, isolated DB)
- [x] Health status page — public `/status` page in the UI polling the public `GET /status` endpoint (API / database / cache)

**Security**

- [x] HaveIBeenPwned check — HIBP k-anonymity query on register and password reset; blocks compromised passwords, fails open on network errors (`HIBP_CHECK_ENABLED`)
- [x] Login notification email — new-device login sends a security alert with a one-click session revoke link (`LOGIN_NOTIFICATION_ENABLED`)
- [x] Account takeover detection — password reset + email change within 1h revokes other sessions and alerts both old and new email addresses; email change requires password re-auth

**Billing**

- [x] Per-org billing — checkout/portal/subscription accept `orgId`; one Stripe subscription per organization, managed by org owners/admins
- [x] Trial period — 14-day free trial for first-time subscribers (`TRIAL_DAYS`) with trial-ending warning and trial-ended upgrade emails

---

### P1 — Core growth

Complete within the first month after launch.

**Billing & Revenue**

- [x] Upgrade/downgrade flows — `POST /billing/change-plan` with Stripe proration (immediate or end-of-cycle)
- [x] Usage counters — API calls metered per billing period via API-key middleware; `GET /billing/usage` reports usage vs plan limits (seats live-counted for orgs)
- [x] Dunning management — D3 / D7 / D14 escalating emails for past_due subscriptions with payment link; recovered payments clear the sequence
- [x] Cancellation flow — offboarding survey (reason + comment → feedback table), pause-instead option via Stripe `pause_collection`, retention coupon offer
- [x] Win-back campaign — automated emails at D7 / D30 / D90 after cancellation with optional `STRIPE_WINBACK_COUPON` code

**Admin**

- [x] Impersonate user — `POST /admin/users/:id/impersonate` creates a 30-minute support session; always audit-logged; admins cannot impersonate admins
- [x] Manual plan override — `PUT /admin/users/:id/plan` sets plan + optional trial days from the admin panel
- [x] Revenue dashboard — `/admin/revenue` shows MRR, ARR, churn rate, past-due and trial counts with by-plan breakdown
- [x] Broadcast email — `/admin/revenue` composer sends announcements to all users or segments (free/pro/enterprise/inactive) as in-app notifications + optional email

**Observability**

- [x] Distributed tracing viewer — `docker-compose.tracing.yml` runs Jaeger all-in-one; point `OTEL_EXPORTER_OTLP_ENDPOINT` at it
- [x] Alerting — error-spike and latency-breach middleware dispatches to Slack / Teams / PagerDuty channels with cooldown (`ALERT_*` env vars)

---

### P2 — Quality & scale

Complete within the first quarter.

**Developer Experience**

- [x] User-facing webhooks — `/dashboard/webhooks` management UI, HMAC-SHA256 signed payloads (`X-ZeroAuth-Signature`), retry with backoff, test ping
- [x] Upgrade prompt component — `UpgradePrompt` (modal + banner variants) ready to drop in wherever a plan gate blocks an action
- [x] Feature flag management UI — admin CRUD at `/admin/feature-flags`: global toggle, per-user force-enable, stable percentage rollout
- [x] CSV export — users and audit logs export endpoints (`/admin/users/export`, `/admin/audit/export`) with export button on the revenue page

**PWA & Mobile**

- [x] Offline support — `public/sw.js` precaches the app shell + `offline.html`; mutating API calls queue in IndexedDB (`lib/offlineQueue.ts`) and replay via Background Sync on reconnect. Registered by `ServiceWorkerRegistrar` (production only)
- [x] Deep linking — `/invite/:token` and `/magic-link/verify` preserve `next`/`redirect` and open in the installed PWA via manifest `scope` + `launch_handler: navigate-existing`
- [x] Web push notifications — VAPID `webPush.service.ts`, `push_subscriptions` table (migration `0005`), `/notifications/push/*` endpoints, SW `push` handler; per-device opt-in on `/dashboard/notifications`. Fires from `broadcastNotification` even when the PWA is closed; no-ops without VAPID keys

**Onboarding & UX**

- [x] Empty states — shared `EmptyState` component (icon, title, description, CTA) used in the webhooks page; drop into any list
- [x] Product tour — dependency-free first-login spotlight walkthrough (`ProductTour.tsx`) anchored to `[data-tour]` nav items; shown once via a versioned localStorage key
- [x] Welcome email — sent immediately after registration with login link

**i18n Completeness**

- [x] Locale-aware formatting — `lib/format.ts` wraps `Intl.DateTimeFormat` / `NumberFormat` / `RelativeTimeFormat`; `useFormat()` binds to the active next-intl locale (used by `NotificationBell`)
- [ ] Locale-aware email templates — send transactional emails in the user's stored locale
- [ ] RTL layout support — `dir="rtl"` on `<html>`; audit CSS for absolute positioning that breaks in RTL
- [x] Missing-translation fallback — English merged underneath the active locale so untranslated keys render in English; missing-key warnings logged in dev

**Customer Support**

- [ ] Live chat widget — Crisp, Intercom, or Tawk.to embed in dashboard layout
- [ ] Support ticket model — lightweight tickets if you don't want a third-party tool

---

### P3 — Differentiation

Nice-to-have; tackle when the core product is stable and growing.

**Revenue Expansion**

- [x] Per-org Stripe billing (one subscription per tenant, not per user)
- [ ] Usage-based upsell nudges — "You've used 80% of your API quota" → in-app + email upgrade prompt
- [ ] Lifetime deal (LTD) plan type — one payment, no subscription, with usage cap enforcement
- [ ] Multi-currency pricing — display in user's local currency; Stripe FX handling
- [ ] Purchasing Power Parity (PPP) — automatic regional discounts by country
- [ ] Stripe Tax — auto-calculate VAT / GST / sales tax by customer location

**White-labeling & Enterprise**

- [ ] Custom domain per tenant — orgs map `app.theirdomain.com` to the platform
- [ ] Per-tenant branding — org logo, brand color, and app name override defaults
- [ ] Custom email domain — org sends transactional email from `noreply@theirdomain.com`
- [ ] IP allowlist per org — restrict API + dashboard access to specific CIDR ranges
- [ ] SOC 2 Type II readiness — access control evidence, change management, incident response

**Integrations**

- [ ] Zapier integration — triggers (new user, new payment) and actions (create user, update plan)
- [ ] Make (Integromat) — share OpenAPI spec to auto-generate module
- [ ] Slack app — slash commands + DM notifications for key events
- [ ] HubSpot / Salesforce CRM sync — push signups and plan changes, sync contacts back
- [ ] Segment.io or Rudderstack — server-side analytics pipeline to any downstream tool

**Loyalty & Growth**

- [ ] Loyalty / rewards system — points, tiers (Bronze → Platinum), redemption catalog
- [ ] Referral program — unique signed links, attribution, rewards for referrer and referee
- [ ] Gamification — badges, streak tracking, progress bars, challenges
- [ ] AI-powered onboarding assistant — chat widget guiding new users through setup

**Mobile**

- [ ] React Native / Expo app — shared auth logic; biometric login (Face ID / fingerprint) via passkeys
- [ ] Deep universal links — iOS App Clips / Android Instant Apps for invite and magic-link flows

**Analytics & Search**

- [ ] Product analytics dashboard — PostHog or Plausible for feature usage + funnel tracking
- [ ] Churn prediction score — logistic regression on usage signals; at-risk score in admin
- [ ] Global command palette — `Cmd+K` search across users, settings, docs, and recent actions
- [ ] Elasticsearch full-text search — index user content, surface results with highlighting

**Collaboration**

- [ ] Team activity feed — per-org timeline of who did what
- [ ] @mentions — trigger in-app + email notification
- [ ] Real-time presence — show which team members are online (WebSocket heartbeat)

---

## All features by category

Comprehensive checklist. Items marked `[x]` are production-ready in the current codebase.

---

### Auth & Identity

- [x] Email + password with account lockout (configurable threshold + auto-unlock)
- [x] Google, GitHub, Apple, Facebook OAuth (toggle per method from admin)
- [x] Magic link (passwordless, 15-min TTL, delivered via email)
- [x] Passkeys / WebAuthn FIDO2 (register, authenticate, resident keys)
- [x] TOTP (Google Authenticator, Authy, 1Password compatible)
- [x] Email OTP
- [x] SMS OTP (Twilio)
- [x] WhatsApp OTP (Twilio)
- [x] Telegram OTP (Twilio)
- [x] PASETO v4 access tokens (AES-256-GCM, 1-hour TTL)
- [x] Refresh tokens (hashed, rotated on use, long-lived)
- [x] Session management — list, revoke, device fingerprinting
- [x] RBAC + ABAC with JIT privilege escalation
- [x] Continuous access evaluation — re-verification challenges after sensitive ops
- [x] Anomaly detection — flag unusual login location / time / device
- [x] Rate limiting — per-IP sliding window, Redis-backed with in-memory fallback
- [x] OIDC provider — full OpenID Connect server
- [x] SAML 2.0 SSO — SP-initiated for Okta, Azure AD, Google Workspace
- [x] SCIM 2.0 — auto-provision / deprovision users from IdP
- [x] LDAP / Active Directory sync
- [x] HaveIBeenPwned check on register / password change
- [x] Login notification email — new-device alert with revoke link
- [x] Account takeover detection — flag sensitive changes in short window
- [x] Decentralized identity — `did:key` / `did:web` resolver + proof-of-control challenge (`/admin/did`)
- [x] Identity federation — RFC 8693 token exchange + trusted-provider registry (`/admin/federation`)
- [x] Workload / agent identity — scoped client-credential tokens with `principal_type: agent` (`/admin/workload`)
- [x] Cross-tenant JIT access — request + admin approval inbox, auto-expiring grants (`/dashboard/jit`, `/admin/jit`)

---

### Billing & Subscriptions

- [x] Stripe checkout — creates Stripe Checkout Session, returns URL
- [x] Stripe customer portal — manage cards, cancel, download invoices
- [x] Stripe webhook handler — `subscription.updated`, `invoice.payment_failed`, `subscription.deleted`
- [x] `subscriptionsTable` — stores plan, status, period dates per user
- [x] `requirePlan()` middleware — blocks with `403 PLAN_REQUIRED` when feature not on plan
- [x] `PLAN_CONFIGS` in `src/shared/plans.ts` — free / pro / enterprise feature matrix
- [x] Billing dashboard — plan cards, upgrade CTA, manage subscription button
- [x] Per-org billing — one subscription per organization
- [x] Trial period — 14-day trial with expiry email and upgrade prompt
- [x] Upgrade / downgrade flows — proration, immediate or period-end
- [x] Usage counters — API calls metered, seats live-counted, vs plan limits
- [x] Dunning management — retry failed payments D3 / D7 / D14
- [x] Cancellation flow — survey, offer pause / discount
- [x] Win-back campaign — automated emails to churned users
- [ ] Stripe Tax — auto VAT / GST / sales tax by location
- [ ] Multi-currency pricing with PPP discounts
- [ ] Lifetime deal (LTD) plan type

---

### Organizations & Teams

- [x] Workspace model — one org → many members, one user → many orgs
- [x] Invite by email — time-limited signed invite links
- [x] Org roles — owner, admin, member, viewer with permission checks
- [x] Transfer ownership — reassign with confirmation flow
- [x] Org settings page — name, logo, slug, billing contact
- [x] Remove / leave org — safety checks (can't remove last owner)
- [x] Custom org roles & permissions — fine-grained resource permissions per org
- [x] Per-org Stripe billing
- [ ] Per-org branding — logo, color, app name override
- [ ] Custom domain per tenant

---

### API Keys (developer API)

- [x] API key model — named keys, SHA-256 hashed (never store plain), scopes, per-user or per-org
- [x] Key creation UI — generate key, show plaintext once, copy to clipboard
- [x] Usage tracking — `lastUsedAt` timestamp updated on every request
- [x] Revoke — instant revocation via `revokedAt` timestamp
- [x] Key scopes — `read:data`, `write:data`, etc. stored and enforced in middleware
- [x] `apiKeyAuth` middleware — `Bearer <key>` or `X-API-Key` header
- [ ] Scope enforcement per route (gate routes by required scope)
- [ ] Key rotation policy — force rotation after N days
- [ ] Rate limiting per key

---

### Email

- [x] BullMQ email queue — sending never blocks a request; Redis-backed with retry
- [x] Nodemailer SMTP transport — configurable host / port / credentials
- [x] Transactional email templates — welcome, verify, invite, receipt, magic link, password reset
- [x] Inline-styled HTML email templates
- [x] Notification preferences — users choose which emails they receive
- [x] Unsubscribe tokens — HMAC-SHA256 signed, one-click unsubscribe (CAN-SPAM)
- [ ] Locale-aware email templates — send in user's stored locale
- [x] Welcome email sent on registration
- [x] Trial expiry warning emails
- [x] Dunning emails — failed payment escalation sequence
- [x] Win-back emails — D7 / D30 / D90 after cancellation
- [x] Security alert emails — new-device login, account takeover pattern
- [x] Billing event template — reusable title/body/CTA layout for lifecycle emails

---

### Notifications

- [x] Notification model — per-user with `read` / `unread` state
- [x] Bell icon + dropdown — notification center UI in dashboard nav
- [x] Mark as read — single and bulk
- [x] Real-time delivery — Server-Sent Events (SSE) push
- [x] Notification preferences — granular per-channel per-category control
- [x] Email fallback — deliver via email if user hasn't visited in N days
- [x] Web push notifications — service worker + Push API (VAPID), `push_subscriptions` table, per-device opt-in

---

### File Storage & Uploads

- [x] Avatar upload — JPEG/PNG/GIF/WebP, 5 MB limit, stored and served
- [ ] S3-compatible storage — AWS S3, Cloudflare R2, or MinIO adapter
- [ ] Pre-signed upload URLs — secure direct-to-storage uploads from browser
- [ ] File attachments — per-feature uploads with type / size validation
- [ ] CDN delivery — serve files from edge for fast global access

---

### Onboarding

- [x] Setup checklist — "complete your profile", "enable MFA", etc. with progress tracking
- [x] Welcome email sent immediately after registration
- [x] Empty states — shared `EmptyState` component with CTA (adopt per list)
- [x] Product tour — dependency-free first-login spotlight walkthrough (`ProductTour.tsx`)
- [ ] Onboarding completion event — fire analytics event + notify sales/Slack on new signups

---

### User Dashboard

- [x] Profile — display name, avatar, language preference
- [x] Security — password change, MFA (TOTP + passkeys), active sessions
- [x] Sessions — list all active sessions with device info, revoke any
- [x] Account — GDPR data export, account deletion (30-day soft-delete)
- [x] Notification settings — per-channel per-category preferences
- [x] Organizations — org list, create org, view members
- [x] API Keys — create, list (prefix only), revoke
- [x] Billing — plan cards, upgrade CTA, manage subscription

---

### Admin Panel

- [x] Stats dashboard — user count, active sessions, recent registrations
- [x] User management — list, search, view detail, edit roles, force logout, delete
- [x] Session browser — view all active sessions, revoke any
- [x] Audit log viewer — searchable immutable event trail
- [x] Auth settings — toggle every auth method on/off live
- [x] General settings — app name, URL, branding
- [x] Impersonate user — log in as any user (audit-logged, 30-min session)
- [x] Manual plan override — bump user to Pro, add trial days
- [x] Broadcast email — send announcement to all or filtered users
- [x] Revenue metrics — MRR, ARR, churn, past due at a glance (`/admin/revenue`)
- [x] Feature flag management — admin CRUD API with rollout controls
- [x] CSV exports — users and audit logs

---

### GDPR & Compliance

- [x] GDPR data export — "Export my data" downloads JSON of all user data
- [x] Account deletion — 30-day soft-delete, then full PII purge
- [x] Data retention — auto-purge audit logs, sessions, OTPs after configurable intervals
- [x] Cookie consent banner — GDPR-compliant accept / reject
- [x] Privacy policy page — `/privacy`
- [x] Terms of service page — `/terms`
- [x] CAN-SPAM unsubscribe — one-click signed unsubscribe tokens

---

### Observability

- [x] Prometheus metrics — `/metrics` endpoint (prom-client)
- [x] OpenTelemetry tracing — `NodeSDK` with OTLP exporter, `withSpan()` helper, auto-instrumentation
- [x] Sentry — `@sentry/node` server capture + `@sentry/nextjs` React error boundaries
- [x] Structured logging — `getLogger()` with log levels
- [x] Audit log — immutable event trail written to Elasticsearch
- [x] Distributed tracing viewer — `docker-compose.tracing.yml` (Jaeger all-in-one, OTLP)
- [x] Health status page — public `/status` page + endpoint
- [x] Alerting — Slack / Teams / PagerDuty on error spike or latency breach

---

### SEO & Marketing

- [x] Landing page — hero, features, pricing sections (plain Tailwind, no component library)
- [x] Blog — MDX-powered posts at `/blog`
- [x] Changelog — versioned release notes at `/changelog`
- [x] Proper meta tags — `<title>`, `<meta description>`, Open Graph, Twitter cards
- [x] Sitemap.xml + robots.txt — generated at build time by Next.js
- [x] Cookie consent banner with consent-gated analytics
- [x] Plausible Analytics — `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`
- [x] Google Analytics 4 — `NEXT_PUBLIC_GA_MEASUREMENT_ID`

---

### i18n

- [x] Foundation — next-intl installed, `NextIntlClientProvider` wrapping app
- [x] Translation files — `/messages/{locale}.json` (en, es, fr)
- [x] Locale detection — `Accept-Language` on first visit, cookie-persisted
- [x] Language switcher — dropdown in nav and settings, persists to profile
- [x] Locale-aware formatting — `lib/format.ts` + `useFormat()` over `Intl.*` (date/number/currency/relative-time)
- [ ] RTL layout support — `dir="rtl"` toggle on `<html>`
- [ ] Locale-aware email templates
- [ ] hreflang tags on marketing pages
- [x] Missing-translation fallback — English merged under active locale, missing keys logged in dev

---

### CI/CD & Deployment

- [x] GitHub Actions CI — lint + type-check + test + UI build on every push / PR
- [x] Docker Compose — full development stack in one command
- [x] Dockerfile — multi-stage production image
- [x] Railway one-click deploy button
- [x] Render one-click deploy button
- [x] Secret rotation — zero-downtime procedure documented in README
- [x] Environment parity — `.env.staging.example` staging template
- [x] DB backup — `bun run db:backup` + daily scheduler, 30-day retention, optional S3

---

### Security

- [x] PASETO v4 tokens — AES-256-GCM, no JWT footguns
- [x] Refresh tokens — SHA-256 hashed, rotated on use
- [x] Silent token refresh — UI replays a 401 via the refresh token, else redirects to login
- [x] Protected routes — client guards on `/dashboard` + `/admin`, redirect signed-out users
- [x] Disposable-email blocking — block/allow lists + optional MX check on register
- [x] Rate limiting — per-IP sliding window
- [x] Account lockout — configurable threshold + auto-unlock
- [x] RBAC + ABAC — roles, permissions, JIT escalation
- [x] API keys — SHA-256 hashed, never stored plain
- [x] Unsubscribe tokens — HMAC-SHA256 signed
- [x] HaveIBeenPwned password check
- [x] Login notification emails — new-device alert with revoke link
- [x] Account takeover detection
- [x] Security headers — Hono secureHeaders middleware on every route
- [ ] Bug bounty / responsible disclosure page at `/security`

---

### Webhooks (user-facing)

- [x] Webhook endpoint management — `/dashboard/webhooks` UI + REST API to add / edit / delete endpoints
- [x] Event catalog — typed `WebhookEventType` union covering auth, user, session and anomaly events
- [x] Signed payloads — HMAC-SHA256 `X-ZeroAuth-Signature` header so receivers can verify
- [x] Test delivery — ping button sends a signed test event to the endpoint
- [x] Retry with backoff — automatic retry on 5xx or timeout per endpoint retry policy
- [ ] Delivery logs UI — persisted per-attempt history with response status

---

### Analytics & Reporting

- [ ] Product analytics — PostHog or Plausible for feature usage events
- [x] Revenue dashboard — MRR, ARR, churn rate in admin panel
- [ ] Funnel tracking — signup → activation → paid conversion
- [x] Per-user usage stats — API calls and seats vs plan limits (`GET /billing/usage`)
- [x] CSV export — admin can export user list and audit logs
- [ ] Churn prediction score — at-risk score from usage signals in admin

---

### Revenue Recovery & Retention

- [x] Dunning management — retry D3 / D7 / D14, escalating email sequence
- [x] Pause subscription — Stripe `pause_collection` with one-click resume
- [x] Cancellation flow — survey, offer pause / discount, gather churn insight
- [x] Win-back campaign — automated D7 / D30 / D90 emails with discount codes
- [ ] Usage-based upsell nudges — "80% of quota used" → upgrade prompt in-app + email
- [ ] Plan downgrade warnings — show what will be lost before confirming

---

### Enterprise

- [x] SAML 2.0 SSO — SP-initiated for Okta, Azure AD, Google Workspace
- [x] SCIM 2.0 provisioning — auto-create / deactivate users from IdP (RFC 7644)
- [x] LDAP / Active Directory sync
- [x] Custom org roles & permissions
- [x] Audit log export — CSV download (`GET /admin/audit/export`)
- [ ] IP allowlist per org — restrict to specific CIDR ranges
- [ ] Data residency — choose storage region per org (EU / US / APAC)
- [ ] SOC 2 Type II readiness checklist

---

### Loyalty & Rewards

- [ ] Points model — balance, lifetime total, expiry per user
- [ ] Earning rules engine — daily login, referral, first payment, profile complete, etc.
- [ ] Tier system — Bronze / Silver / Gold / Platinum with perks per tier
- [ ] Redemption catalog — account credit, feature unlock, extended trial, swag codes
- [ ] Points history page — timestamped ledger
- [ ] Expiry policy — points expire after 12 months of inactivity

---

### Referral & Affiliate

- [ ] Referral link generator — unique signed short-link per user
- [ ] Referral tracking — cookie + UTM attribution, `referredBy` on new user
- [ ] Referral rewards — credit or points when referee converts to paid
- [ ] Referral dashboard — clicks, signups, conversions per link
- [ ] Affiliate portal — commissions, payout history, payment threshold
- [ ] Fraud detection — flag self-referrals, same-IP patterns

---

### Gamification & Engagement

- [ ] Achievement badges — milestones: "First Login", "Power User", "Early Adopter"
- [ ] Streak tracking — daily login streak with grace period
- [ ] Progress bars — onboarding %, profile completeness %, plan usage %
- [ ] Weekly / monthly challenges with point rewards
- [ ] Social sharing — tier achievement share card (Satori OG image)
- [ ] Level-up notifications — in-app + email on tier change

---

### White-labeling & Custom Domains

- [ ] Custom domain per tenant — Cloudflare for SaaS / Vercel Domains API
- [ ] Custom subdomain — auto-provision `theirorg.yourapp.com` on org creation
- [ ] Per-tenant branding — logo, brand color, app name
- [ ] Custom email domain — tenant sends from their own domain
- [ ] Remove "Powered by" badge — white-label tier hides all starter branding
- [ ] Custom login page — org-specific login URL with their branding

---

### Integrations & Automation

- [ ] Zapier integration — triggers (new user, payment) + actions (create user, update plan)
- [ ] Make (Integromat) — share OpenAPI spec to auto-generate module
- [ ] Slack app — slash commands + DM notifications for key events
- [ ] Native integration marketplace — `/integrations` with per-user OAuth flows
- [ ] HubSpot / Salesforce sync — push signups, plan changes; sync contacts back
- [ ] Segment.io or Rudderstack — server-side analytics pipeline

---

### Mobile & Offline

- [x] PWA manifest — `manifest.json`, service worker, "Add to Home Screen"
- [x] Offline support — service worker app-shell cache + IndexedDB write queue with Background Sync
- [x] Deep linking — invite and magic-link URLs open correctly in browser and installed PWA
- [x] Web push notifications — service worker + Push API (VAPID), per-device opt-in
- [ ] React Native / Expo app — biometric login via passkeys

---

### AI & Smart Features

- [ ] AI-powered onboarding assistant — chat widget using Claude / GPT-4o
- [ ] Smart search — semantic search or embeddings across user data
- [ ] Churn prediction score — logistic regression on usage signals
- [ ] Auto-generated weekly digest email — LLM summary of account activity
- [ ] AI support bot — trained on help docs, escalates to human
- [ ] Usage recommendations — personalized feature suggestions

---

### Advanced Search

- [ ] Global command palette — `Cmd+K` across users, settings, docs, recent actions
- [ ] Elasticsearch full-text search — index content, surface with highlighting
- [ ] Faceted filters — type, date, plan, status with instant counts
- [ ] Search analytics — log zero-result queries

---

### Collaboration & Activity

- [ ] Team activity feed — per-org timeline of who did what
- [ ] @mentions — trigger in-app + email notification
- [ ] Real-time presence — show online team members (WebSocket heartbeat)
- [ ] Shared notes — lightweight collaborative notes per org (Tiptap)

---

### Customer Success

- [ ] Health score per account — composite score from login frequency, feature depth, team size
- [ ] At-risk account alerts — Slack / email to CS team when score drops
- [ ] Automated lifecycle emails — D1 welcome, D3 tips, D7 check-in, D14 trial expiry
- [ ] NPS survey automation — in-app prompt after 30 days, quarterly thereafter
- [ ] Customer segments — tag accounts as "champion", "at-risk", "expansion candidate"

---

### Tax, Multi-currency & Global

- [ ] Stripe Tax — auto-calculate VAT / GST / sales tax by customer location
- [ ] Tax exemption certificates — nonprofits and B2B EU orgs submit VAT ID
- [ ] Multi-currency pricing — display in user's local currency; Stripe FX
- [ ] Purchasing Power Parity (PPP) — automatic regional discounts by country GDP
- [ ] EU VAT compliance — collect and validate EU VAT numbers via VIES
