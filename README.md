# ZeroAuth — SaaS Starter

A production-ready SaaS boilerplate with enterprise-grade authentication built in. Clone it, add your business logic, and ship.

**Backend:** Hono + TypeScript + PostgreSQL (Drizzle ORM) + Redis  
**Frontend:** Next.js 16.2 + Tailwind CSS — landing page, user dashboard, and admin panel in one app

---

## What's built

|     | Feature                                                                          |
| --- | -------------------------------------------------------------------------------- |
| ✅  | Email + password auth with account lockout                                       |
| ✅  | Google, GitHub, Apple, Facebook OAuth                                            |
| ✅  | Magic link (passwordless, 15-min TTL)                                            |
| ✅  | Passkeys / WebAuthn (FIDO2)                                                      |
| ✅  | TOTP (Google Authenticator, Authy, 1Password)                                    |
| ✅  | Email OTP, SMS OTP (Twilio), WhatsApp, Telegram MFA                              |
| ✅  | Session management — list, revoke, device tracking                               |
| ✅  | Protected routes — client-side dashboard/admin guards, redirect to login         |
| ✅  | Silent token refresh — auto-replays a 401 via the refresh token                  |
| ✅  | PASETO v4 tokens (AES-256-GCM, no JWT footguns)                                  |
| ✅  | RBAC + ABAC with JIT privilege escalation                                        |
| ✅  | Continuous access evaluation + anomaly detection                                 |
| ✅  | Rate limiting (Redis-backed, in-memory fallback)                                 |
| ✅  | OIDC provider + SAML 2.0 SSO                                                     |
| ✅  | Decentralized identity — did:key / did:web resolver + proof-of-control           |
| ✅  | Identity federation (RFC 8693 token exchange) — admin provider registry          |
| ✅  | Workload / agent identity — scoped client-credential tokens (agent claim)        |
| ✅  | Cross-tenant JIT access — request + admin approval inbox, auto-expiring          |
| ✅  | SCIM 2.0 user provisioning                                                       |
| ✅  | LDAP / Active Directory sync                                                     |
| ✅  | User dashboard — profile, security, sessions                                     |
| ✅  | Admin panel at `/admin` — users, sessions, audit log, feature toggles            |
| ✅  | Dark mode toggle (system preference + manual, persisted)                         |
| ✅  | Toast notification system                                                        |
| ✅  | Loading skeletons                                                                |
| ✅  | Mobile-responsive layouts                                                        |
| ✅  | PWA — installable, offline app-shell + IndexedDB write queue (Background Sync)   |
| ✅  | Web push notifications — service worker + Push API (VAPID), per-device opt-in    |
| ✅  | First-login product tour — dependency-free spotlight walkthrough                 |
| ✅  | Locale-aware formatting — `Intl.*` dates/numbers/relative-time via `useFormat()` |
| ✅  | Cookie consent banner (GDPR)                                                     |
| ✅  | Privacy policy + Terms of service pages                                          |
| ✅  | GDPR data export + 30-day soft-delete account deletion                           |
| ✅  | Organizations & teams — workspaces, invite flows, org roles                      |
| ✅  | Custom org roles with fine-grained permission sets                               |
| ✅  | Notification center — bell icon, SSE real-time, email fallback digest            |
| ✅  | Notification preferences + CAN-SPAM unsubscribe tokens                           |
| ✅  | Avatar upload (JPEG/PNG/GIF/WebP, 5 MB limit)                                    |
| ✅  | In-app NPS / thumbs feedback widget                                              |
| ✅  | Analytics — Plausible and GA4 with consent gate                                  |
| ✅  | Blog + Changelog pages                                                           |
| ✅  | Sentry error monitoring — error boundaries + optional server capture             |
| ✅  | i18n — next-intl, locale detection, language switcher (EN/ES/FR)                 |
| ✅  | BullMQ email queue — non-blocking transactional delivery                         |
| ✅  | Data retention — auto-purge audit logs, sessions, OTPs                           |
| ✅  | Immutable audit log (Elasticsearch)                                              |
| ✅  | Prometheus metrics + OpenTelemetry tracing                                       |
| ✅  | Docker Compose — full stack in one command                                       |
| ✅  | GitHub Actions CI (lint + type-check + test + UI build)                          |
| ✅  | One-click deploy — Railway and Render buttons                                    |
| ✅  | API key management — named keys, SHA-256 hashed, scopes, revoke                  |
| ✅  | Stripe billing — checkout, customer portal, webhook handler                      |
| ✅  | Plan feature gates — `requirePlan()` middleware (free/pro/enterprise)            |
| ✅  | Billing dashboard — plan cards, Stripe checkout, manage subscription             |
| ✅  | Help center — `/help` searchable FAQ with category filter                        |
| ✅  | Onboarding setup checklist — dismissable progress widget on dashboard            |

---

## Ports

| Service       | URL                         |
| ------------- | --------------------------- |
| API           | http://localhost:3000       |
| App + Admin   | http://localhost:3000       |
| Admin panel   | http://localhost:3000/admin |
| API docs      | http://localhost:3000/docs  |
| PostgreSQL    | localhost:5432              |
| Redis         | localhost:6379              |
| Elasticsearch | http://localhost:9200       |
| Kibana        | http://localhost:5601       |

---

## One-click deploy

| Platform    | Button                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Railway** | [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/ALFAMAS/zeroauth)            |
| **Render**  | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ALFAMAS/zeroauth) |

Both platforms auto-detect Docker and provision a managed PostgreSQL + Redis. Set the required env vars (`TOKEN_SECRET_HEX`, `CSFLE_MASTER_KEY_HEX`, `DATABASE_URL`, `REDIS_URI`) during the deploy wizard.

---

## Option A — Docker (recommended)

The fastest way. Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

### 1. Clone

```bash
git clone https://github.com/ALFAMAS/zeroauth my-saas
cd my-saas
```

### 2. Generate secrets

```bash
openssl rand -hex 32   # copy this → TOKEN_SECRET_HEX
openssl rand -hex 32   # copy this → CSFLE_MASTER_KEY_HEX
```

### 3. Create `.env`

```bash
cp .env.example .env
```

Open `.env` and paste in your two secrets:

```env
TOKEN_SECRET_HEX=<paste here>
CSFLE_MASTER_KEY_HEX=<paste here>
```

Everything else has working defaults for local development.

### 4. Start the backend stack

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, Elasticsearch, Kibana, and the API. Wait ~30 seconds, then confirm it's healthy:

```bash
docker compose logs -f zeroauth
# Look for: "Server listening on http://localhost:3000"
```

### 5. Start the UI

In a second terminal:

```bash
cd packages/ui
npm install
npm run dev
```

Open **http://localhost:3000** to see the landing page.

### 6. Create your first admin account

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!","displayName":"Admin"}'

# Grant admin role
docker exec -it zeroauth-postgres psql -U zeroauth -d zeroauth \
  -c "UPDATE users SET roles = array_append(roles, 'admin') WHERE email = 'admin@example.com';"
```

Log in at **http://localhost:3000/login**. Admin panel: **http://localhost:3000/admin**.

### Manage the stack

```bash
docker compose down        # stop, keep data
docker compose down -v     # stop, wipe all data
docker compose restart     # restart all services
```

---

## Option B — VPS Deployment

Step-by-step for **Ubuntu 22.04** (DigitalOcean, Hetzner, Linode, AWS EC2, etc.).

**Time:** ~45 minutes  
**You need:** a VPS, a domain name pointed at its IP, SSH access

### 1. Connect and update

```bash
ssh root@YOUR_SERVER_IP
apt update && apt upgrade -y
```

### 2. Install dependencies

```bash
# Tools
apt install -y curl git nginx certbot python3-certbot-nginx ufw

# Bun (API runtime)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Node.js 20 (for Next.js UI)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# PM2 process manager
npm install -g pm2
```

### 3. Install PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
systemctl start postgresql && systemctl enable postgresql

sudo -u postgres psql <<SQL
CREATE USER zeroauth WITH PASSWORD 'CHANGE_THIS_PASSWORD';
CREATE DATABASE zeroauth OWNER zeroauth;
GRANT ALL PRIVILEGES ON DATABASE zeroauth TO zeroauth;
SQL
```

### 4. Install Redis

```bash
apt install -y redis-server

# Add a password — open the config and uncomment the requirepass line
sed -i 's/# requirepass foobared/requirepass CHANGE_THIS_PASSWORD/' /etc/redis/redis.conf
systemctl restart redis && systemctl enable redis
```

### 5. Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

### 6. Clone and configure

```bash
# Create a dedicated user
useradd -m -s /bin/bash zeroauth && su - zeroauth

# Clone
git clone https://github.com/ALFAMAS/zeroauth /home/zeroauth/app
cd /home/zeroauth/app

# Generate secrets
echo "TOKEN_SECRET_HEX=$(openssl rand -hex 32)"
echo "CSFLE_MASTER_KEY_HEX=$(openssl rand -hex 32)"

cp .env.example .env
nano .env
```

Key values to set in `.env`:

```env
TOKEN_SECRET_HEX=<generated above>
CSFLE_MASTER_KEY_HEX=<generated above>

DATABASE_URL=postgresql://zeroauth:CHANGE_THIS_PASSWORD@localhost:5432/zeroauth
REDIS_URI=redis://:CHANGE_THIS_PASSWORD@localhost:6379

NODE_ENV=production
PORT=3000
API_BASE_URL=https://api.yourdomain.com

# Email (needed for magic links and OTP)
MAIL_HOST=smtp.yourprovider.com
MAIL_PORT=587
MAIL_USER=your@email.com
MAIL_PASSWORD=your-smtp-password
MAIL_FROM=noreply@yourdomain.com

# WebAuthn — MUST match your domain
WEBAUTHN_RP_ID=yourdomain.com
WEBAUTHN_RP_NAME=YourApp
WEBAUTHN_RP_ORIGINS=https://yourdomain.com

# OAuth (optional — leave blank to disable)
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=
OAUTH_GOOGLE_REDIRECT_URI=https://api.yourdomain.com/auth/oauth/google/callback
OAUTH_GITHUB_CLIENT_ID=
OAUTH_GITHUB_CLIENT_SECRET=
OAUTH_GITHUB_REDIRECT_URI=https://api.yourdomain.com/auth/oauth/github/callback
```

### 7. Install, migrate, and build

```bash
# Install API dependencies
bun install --production

# Run database migrations
bun run db:migrate

# Compile TypeScript
bun run build
```

### 8. Start the API with PM2

```bash
mkdir -p /home/zeroauth/logs

cat > /home/zeroauth/app/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'zeroauth-api',
    script: 'dist/api/server.js',
    cwd: '/home/zeroauth/app',
    instances: 'max',
    exec_mode: 'cluster',
    env_file: '/home/zeroauth/app/.env',
    error_file: '/home/zeroauth/logs/api-error.log',
    out_file: '/home/zeroauth/logs/api-out.log',
    restart_delay: 1000,
    max_restarts: 10,
  }]
};
EOF

pm2 start ecosystem.config.js
pm2 save
```

Run the PM2 startup command it prints to enable auto-start on reboot.

### 9. Build and start the UI

```bash
cd /home/zeroauth/app/packages/ui
echo "NEXT_PUBLIC_ZEROAUTH_URL=https://api.yourdomain.com" > .env.local

npm install
npm run build

pm2 start npm --name "zeroauth-ui" -- start
pm2 save
```

### 10. Configure Nginx

```bash
exit   # back to root

cat > /etc/nginx/sites-available/zeroauth-api << 'NGINX'
server {
    server_name api.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }
}
NGINX

cat > /etc/nginx/sites-available/zeroauth-ui << 'NGINX'
server {
    server_name yourdomain.com www.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

ln -s /etc/nginx/sites-available/zeroauth-api /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/zeroauth-ui /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 11. Enable HTTPS

```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
certbot --nginx -d api.yourdomain.com
```

Certbot auto-renews. Confirm the timer is running:

```bash
systemctl status certbot.timer
```

### 12. Create your admin account

```bash
curl -X POST https://api.yourdomain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"YourStrongPass123!","displayName":"Admin"}'

sudo -u postgres psql -d zeroauth \
  -c "UPDATE users SET roles = array_append(roles, 'admin') WHERE email = 'admin@yourdomain.com';"
```

Open **https://yourdomain.com** — admin panel at **https://yourdomain.com/admin**.

### Deploying updates

```bash
su - zeroauth && cd /home/zeroauth/app

git pull

# Rebuild and restart API
bun install --production && bun run build
pm2 restart zeroauth-api

# Rebuild and restart UI
cd packages/ui && npm install && npm run build
pm2 restart zeroauth-ui
```

---

## Option C — Local development

**Prerequisites:** Node.js 18+ or Bun 1.0+, PostgreSQL 15+, Redis 7 (optional)

```bash
git clone https://github.com/ALFAMAS/zeroauth my-saas
cd my-saas

# Install all deps (root API + packages/ui workspace)
bun install

# Configure
cp .env.example .env
# Edit .env: set DATABASE_URL, TOKEN_SECRET_HEX, CSFLE_MASTER_KEY_HEX

# Run migrations
bun run db:migrate

# Start API + UI together (hot reload on both)
bun run dev
```

API → http://localhost:3000  
UI → http://localhost:3000

```bash
bun run dev:api    # API only
bun run dev:ui     # UI only
```

---

## Environment variables

| Variable                     | Required | Default               | Description                              |
| ---------------------------- | -------- | --------------------- | ---------------------------------------- |
| `TOKEN_SECRET_HEX`           | ✅       | —                     | 32-byte hex for PASETO tokens            |
| `CSFLE_MASTER_KEY_HEX`       | ✅       | —                     | 32-byte hex for field encryption         |
| `DATABASE_URL`               | ✅       | —                     | PostgreSQL connection string             |
| `REDIS_URI`                  |          | —                     | Redis URL (falls back to in-memory)      |
| `PORT`                       |          | 3000                  | API listen port                          |
| `NODE_ENV`                   |          | development           | `development` or `production`            |
| `API_BASE_URL`               |          | http://localhost:3000 | Public API URL                           |
| `APP_URL`                    |          | http://localhost:3000 | Public frontend URL                      |
| `UNSUBSCRIBE_SECRET`         |          | —                     | 32+ char secret for unsubscribe tokens   |
| `SENTRY_DSN`                 |          | —                     | Sentry DSN for server-side error capture |
| `STRIPE_SECRET_KEY`          |          | —                     | Stripe secret key (starts with `sk_`)    |
| `STRIPE_WEBHOOK_SECRET`      |          | —                     | Stripe webhook signing secret            |
| `STRIPE_PRODUCT_PRO`         |          | —                     | Stripe product ID for Pro plan           |
| `STRIPE_PRODUCT_ENTERPRISE`  |          | —                     | Stripe product ID for Enterprise plan    |
| `OAUTH_GOOGLE_CLIENT_ID`     |          | —                     | Google OAuth                             |
| `OAUTH_GOOGLE_CLIENT_SECRET` |          | —                     | Google OAuth                             |
| `OAUTH_GITHUB_CLIENT_ID`     |          | —                     | GitHub OAuth                             |
| `OAUTH_GITHUB_CLIENT_SECRET` |          | —                     | GitHub OAuth                             |
| `MAIL_HOST`                  |          | —                     | SMTP host                                |
| `MAIL_PORT`                  |          | 587                   | SMTP port                                |
| `MAIL_USER`                  |          | —                     | SMTP username                            |
| `MAIL_PASSWORD`              |          | —                     | SMTP password                            |
| `MAIL_FROM`                  |          | —                     | Sender address                           |
| `TWILIO_ACCOUNT_SID`         |          | —                     | SMS / WhatsApp OTP                       |
| `TWILIO_AUTH_TOKEN`          |          | —                     | SMS / WhatsApp OTP                       |
| `WEBAUTHN_RP_ID`             |          | localhost             | Must match your domain in production     |
| `WEBAUTHN_RP_ORIGINS`        |          | http://localhost:3000 | Allowed origins                          |
| `ELASTICSEARCH_HOST`         |          | localhost             | Audit log storage                        |
| `LOG_LEVEL`                  |          | info                  | debug / info / warn / error              |

**Frontend env vars** (`packages/ui/.env.local`):

| Variable                        | Description                                 |
| ------------------------------- | ------------------------------------------- |
| `NEXT_PUBLIC_ZEROAUTH_URL`      | Backend API base URL (no trailing slash)    |
| `NEXT_PUBLIC_APP_NAME`          | App name shown in UI, emails, and meta tags |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`  | Plausible Analytics domain (consent-gated)  |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics 4 ID (consent-gated)       |
| `NEXT_PUBLIC_SENTRY_DSN`        | Sentry DSN for browser error capture        |
| `SENTRY_DSN`                    | Sentry DSN for Next.js server components    |
| `NEXT_PUBLIC_STRIPE_PRICE_PRO`  | Stripe price ID shown on the billing page   |

Full list with comments: [`.env.example`](./.env.example) and [`packages/ui/.env.example`](./packages/ui/.env.example)

---

## Project structure

```
.
├── src/                            # API (Hono + TypeScript + Drizzle)
│   ├── api/
│   │   ├── server.ts               # Hono app + route mounting
│   │   └── routes/                 # auth, mfa, passkey, session, admin, ...
│   ├── db/
│   │   ├── schema.ts               # Drizzle ORM schema (PostgreSQL)
│   │   └── index.ts                # DB connection pool
│   ├── services/                   # token, magicLink, anomalyDetection, unsubscribe, ...
│   ├── shared/
│   │   ├── plans.ts                # Plan config (free/pro/enterprise) + feature gates
│   │   └── permissions.ts          # Org permission constants
│   └── middleware/                 # auth, rateLimiting, apiKeyAuth, requirePlan, ...
├── packages/
│   └── ui/                         # Next.js 16.2 (port 3000)
│       ├── messages/               # i18n JSON files (en, es, fr)
│       ├── sentry.*.config.ts      # Sentry client / server / edge config
│       └── src/
│           ├── app/
│           │   ├── page.tsx        # Landing page
│           │   ├── (auth)/         # /login /register /magic-link /callback
│           │   ├── dashboard/      # /dashboard — profile, security, sessions, orgs,
│           │   │                   #   api-keys, billing
│           │   ├── admin/          # /admin — admin panel (same app, guarded)
│           │   ├── blog/           # /blog — blog index + post pages
│           │   ├── changelog/      # /changelog — versioned release notes
│           │   ├── help/           # /help — searchable FAQ
│           │   ├── privacy/        # /privacy
│           │   └── terms/          # /terms
│           ├── components/         # FeedbackWidget, LocaleSwitcher, SetupChecklist, ...
│           └── data/               # blog-posts.ts, changelog.ts, faq.ts
├── .github/workflows/ci.yml        # CI — lint + type-check + test + UI build
├── docker-compose.yml              # Full stack
├── drizzle.config.ts               # Drizzle ORM config
├── .env.example                    # All env vars with descriptions
├── implemented.md                  # Shipped feature catalog
├── not-implemented.md              # Backlog + perf + compliance gaps
```

---

## Customizing

### Rename the app

Replace `ZeroAuth` across `packages/ui/src/`:

```
packages/ui/src/app/page.tsx           ← landing page hero + navbar
packages/ui/src/app/layout.tsx         ← <title> and metadata
packages/ui/src/app/dashboard/layout.tsx
packages/ui/src/app/admin/layout.tsx
```

### Change the brand color

Edit `packages/ui/tailwind.config.js`:

```js
colors: {
  brand: "#your-hex",   // default: #6366f1 (indigo)
}
```

Then replace `indigo-` across UI files with `brand-`.

### Add an API route

```typescript
// src/api/server.ts
import myRoutes from "./routes/my.routes";
app.use("/api/my-feature", authMiddleware, myRoutes);
```

### Read the current user in a route

```typescript
// Any handler after authMiddleware
const user = c.get("user");
const isAdmin = user.roles.includes("admin");
```

### Add a custom org role

```bash
POST /orgs/:orgId/roles
{
  "name": "Billing Manager",
  "description": "Can view and manage billing only",
  "permissions": ["billing:view", "billing:manage"]
}
```

Available permissions: `members:read`, `members:invite`, `members:manage`, `billing:view`, `billing:manage`, `settings:view`, `settings:manage`, `audit:view`, `roles:manage`, `invites:manage`.

### Enable error monitoring

Set `SENTRY_DSN` (backend) and `NEXT_PUBLIC_SENTRY_DSN` (frontend) in your env files. The `ErrorBoundary` component in `layout.tsx` automatically captures and reports unhandled React errors with a user-visible retry screen.

### Configure analytics

Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` or `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Scripts are injected only after cookie consent is accepted — fully GDPR-compliant with no changes needed.

### Add a language

1. Create `packages/ui/messages/{locale}.json` (copy from `en.json`)
2. Add the locale to `SUPPORTED_LOCALES` in `src/i18n/request.ts`
3. Add the entry to the `LOCALES` array in `components/LocaleSwitcher.tsx`

### Toggle auth methods

Admin panel → **Auth Settings** → flip any toggle.  
Changes are live immediately — no restart needed.

---

## Key API endpoints

```
POST   /auth/register
POST   /auth/login
POST   /auth/token/refresh
POST   /auth/logout
GET    /auth/me                                 (auth required)
PATCH  /auth/me                                 (auth required)
POST   /auth/me/avatar                          (auth required, multipart)
GET    /auth/unsubscribe?token=...              (email unsubscribe, no auth)

GET    /auth/oauth/google
GET    /auth/oauth/google/callback
GET    /auth/oauth/github
GET    /auth/oauth/github/callback

POST   /auth/magic-link/send
POST   /auth/magic-link/verify

POST   /auth/passkey/register/options           (auth required)
POST   /auth/passkey/register/verify            (auth required)
POST   /auth/passkey/authenticate/options
POST   /auth/passkey/authenticate/verify

POST   /auth/mfa/totp/setup                     (auth required)
POST   /auth/mfa/totp/verify
POST   /auth/mfa/otp/send
POST   /auth/mfa/otp/verify

GET    /sessions                                (auth required)
DELETE /sessions/:id                            (auth required)

GET    /notifications                           (auth required)
GET    /notifications/unread-count              (auth required)
POST   /notifications/:id/read                  (auth required)
POST   /notifications/read-all                  (auth required)
GET    /notifications/sse                       (auth required, SSE stream)
GET    /notifications/preferences               (auth required)
PUT    /notifications/preferences               (auth required)
GET    /notifications/push/public-key            (auth required, VAPID key)
POST   /notifications/push/subscribe             (auth required)
POST   /notifications/push/unsubscribe           (auth required)

GET    /orgs                                    (auth required)
POST   /orgs                                    (auth required)
GET    /orgs/:orgId/members
POST   /orgs/:orgId/invites
GET    /orgs/:orgId/roles                       (auth required)
POST   /orgs/:orgId/roles                       (owner / admin)
PUT    /orgs/:orgId/roles/:roleId               (owner / admin)
DELETE /orgs/:orgId/roles/:roleId               (owner / admin)

POST   /feedback                                (auth required)

GET    /api-keys                                (auth required)
POST   /api-keys                                (auth required)
DELETE /api-keys/:id                            (auth required)

GET    /billing/subscription?orgId=             (auth required — per-user or per-org)
GET    /billing/usage?orgId=                    (auth required — usage vs plan limits)
POST   /billing/checkout                        (auth required — orgId for per-org billing, 14-day trial)
POST   /billing/change-plan                     (auth required — upgrade/downgrade with proration)
POST   /billing/cancel                          (auth required — survey + pause option)
POST   /billing/reactivate                      (auth required)
POST   /billing/portal                          (auth required)
POST   /billing/webhook                         (Stripe webhook — no auth)

POST   /auth/password-reset/request
POST   /auth/password-reset/confirm             (HIBP breach check)
POST   /auth/me/email                           (auth required — password re-auth)

GET    /webhooks                                (auth required — endpoint management)
POST   /webhooks                                (auth required)
PATCH  /webhooks/:id                            (auth required)
DELETE /webhooks/:id                            (auth required)
POST   /webhooks/:id/ping                       (auth required — test delivery)

GET    /gdpr/export                             (auth required)
DELETE /gdpr/account                            (auth required)
POST   /gdpr/account/deletion/cancel            (auth required)

GET    /admin/stats                             (admin only)
GET    /admin/users                             (admin only)
PUT    /admin/users/:id                         (admin only)
DELETE /admin/users/:id                         (admin only)
POST   /admin/users/:id/impersonate             (admin only — 30-min support session)
PUT    /admin/users/:id/plan                    (admin only — manual plan override)
GET    /admin/revenue                           (admin only — MRR/ARR/churn)
POST   /admin/broadcast                         (admin only — announce to segments)
GET    /admin/users/export                      (admin only — CSV)
GET    /admin/audit/export                      (admin only — CSV)
GET    /admin/feature-flags                     (admin only)
PUT    /admin/feature-flags/:key                (admin only)
DELETE /admin/feature-flags/:key                (admin only)
GET    /admin/settings                          (admin only)
PUT    /admin/settings                          (admin only)
GET    /admin/feedback                          (admin only)

GET    /status                                  (public — status page data)
GET    /healthz
GET    /metrics                                 (Prometheus)
GET    /docs                                    (Swagger — dev only)
```

---

## Tests

```bash
bun run test              # run all tests
bun run test:watch        # watch mode
bun run test:coverage     # with coverage report
```

Tests live in `src/__tests__/`. CI runs them on every push and pull request to `main`.

---

## Secret rotation (zero downtime)

**Rotating `TOKEN_SECRET_HEX`:**

1. Add the new key as `TOKEN_SECRET_HEX_NEXT` in `.env`
2. Update the token service to verify with both keys (accept old, sign new)
3. Deploy — existing sessions keep working
4. Wait for all existing tokens to expire (default TTL: 1 hour)
5. Rename `TOKEN_SECRET_HEX_NEXT` → `TOKEN_SECRET_HEX`, remove the old key
6. Deploy again

**Rotating `CSFLE_MASTER_KEY_HEX`:** same dual-key pattern, then re-encrypt stored encrypted fields during the transition window.

---

## Roadmap

See [`implemented.md`](./implemented.md) for the shipped feature catalog and
[`not-implemented.md`](./not-implemented.md) for the backlog, performance
optimizations, and compliance gaps.

**✅ Shipped in 1.7**

- Per-org Stripe subscriptions — one subscription per organization
- DB backup — `bun run db:backup` (pg_dump, 30-day retention, optional S3) + daily scheduler
- Environment parity — `.env.staging.example` staging template
- HaveIBeenPwned password check on register and password change
- Login notification email — new-device alert with one-click session revoke
- Account takeover detection — sensitive-change pattern revokes sessions + alerts
- Trial period — 14-day trial with expiry warning and upgrade emails
- Dunning management — D3/D7/D14 escalating payment-failure emails
- Cancellation flow — offboarding survey, pause option, retention coupon
- Win-back campaign — D7/D30/D90 emails to churned subscribers
- Admin: impersonate user, manual plan override, revenue dashboard (MRR/ARR/churn), broadcast email, CSV exports
- Usage counters — metered API calls per billing period vs plan limits
- User-facing webhooks — endpoint management UI, HMAC-signed payloads, test ping
- Feature flags — admin-managed flags with percentage rollout
- Status page — public `/status` page + endpoint
- Alerting — error-spike and latency alerts to Slack/Teams/PagerDuty
- Distributed tracing viewer — `docker-compose.tracing.yml` (Jaeger) for the existing OTel setup

**P1 — Next up**

- File storage — S3/R2/MinIO adapter, pre-signed upload URLs, CDN delivery
- Upgrade prompt rollout — wire the `UpgradePrompt` component into every plan gate
- Scope enforcement per API-key route + per-key rate limiting

**P2 — Quality & scale (2–3 months)**

- Locale-aware email templates (send transactional email in the user's language)
- RTL layout support
- Live chat widget + support ticket model

_Shipped in 2026-06: PWA offline support, deep linking, web push notifications,
first-login product tour, and locale-aware `Intl.*` formatting._

---

## License

MIT — use it for anything.
