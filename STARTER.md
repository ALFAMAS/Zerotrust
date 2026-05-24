# ZeroAuth SaaS Starter

A production-ready SaaS boilerplate. Drop in your business logic and ship. Built on a zero-trust auth backend — every session verified, every request audited.

---

## What's already built

| | Feature | Notes |
|---|---|---|
| ✅ | Email + password auth | Register, login, forgot password |
| ✅ | Google & GitHub OAuth | Toggle on/off from admin panel |
| ✅ | Magic links | Passwordless email login (15-min TTL) |
| ✅ | Passkeys / WebAuthn | Biometric and hardware key support |
| ✅ | TOTP (authenticator app) | Google Authenticator, 1Password, Authy |
| ✅ | Email OTP | One-time codes delivered via email |
| ✅ | Session management | List active sessions, revoke any, device tracking |
| ✅ | Account lockout | Configurable threshold + auto-unlock duration |
| ✅ | Rate limiting | Per-IP, Redis-backed with in-memory fallback |
| ✅ | User dashboard | Profile, security settings, active sessions |
| ✅ | Admin panel | Users, sessions, audit log, auth toggles — at `/admin` |
| ✅ | Feature flag toggles | Every auth method on/off from the admin UI |
| ✅ | Audit log | Immutable event trail to Elasticsearch |
| ✅ | Dark landing page | Hero, features, pricing sections — ready to customize |
| ✅ | Docker Compose | One command: API + UI + MongoDB + Redis + Elasticsearch + Kibana |

---

## Ports at a glance

| Service | URL |
|---------|-----|
| API (Express) | http://localhost:3000 |
| App + Admin (Next.js) | http://localhost:3001 |
| Admin panel | http://localhost:3001/admin |
| API docs (Swagger) | http://localhost:3000/docs |
| MongoDB | localhost:27017 |
| Redis | localhost:6379 |
| Elasticsearch | http://localhost:9200 |
| Kibana | http://localhost:5601 |

---

## Step-by-step: running the project

### Option A — Docker (recommended, zero setup)

**Prerequisites:** Docker Desktop installed and running.

```bash
# 1. Clone the saas-starter branch
git clone https://github.com/ALFAMAS/zeroauth -b saas-starter my-saas
cd my-saas

# 2. Generate two random 32-byte secrets
openssl rand -hex 32   # copy → TOKEN_SECRET_HEX
openssl rand -hex 32   # copy → CSFLE_MASTER_KEY_HEX

# 3. Create your .env file
cp .env.example .env
# Open .env and fill in the two keys above + any OAuth credentials

# 4. Start everything
docker compose up -d

# 5. Watch the logs until the API is healthy
docker compose logs -f zeroauth
# You should see: "Server listening on http://localhost:3000"
```

Then open http://localhost:3001 — you'll see the landing page.

To stop: `docker compose down`
To wipe data: `docker compose down -v`

---

### Option B — Local development (no Docker)

**Prerequisites:**
- Node.js 18+ (check: `node -v`) — or Bun 1.0+
- MongoDB 7 running locally (`mongod`) — or use MongoDB Atlas
- Redis 7 running locally (optional, falls back to in-memory rate limiting)

```bash
# 1. Clone
git clone https://github.com/ALFAMAS/zeroauth -b saas-starter my-saas
cd my-saas

# 2. Install all dependencies
npm install
# (installs root deps + registers packages/ui via workspace)

# 3. Also install the UI's own deps
cd packages/ui && npm install && cd ../..

# 4. Generate secrets
openssl rand -hex 32   # → TOKEN_SECRET_HEX
openssl rand -hex 32   # → CSFLE_MASTER_KEY_HEX

# 5. Create .env
cp .env.example .env
```

Edit `.env` — minimum required:
```bash
TOKEN_SECRET_HEX=<your-key>
CSFLE_MASTER_KEY_HEX=<your-key>
MONGO_URI=mongodb://localhost:27017/zeroauth
```

```bash
# 6. Start API + UI together
npm run dev
```

This starts:
- **API** on http://localhost:3000 (with hot reload)
- **UI** on http://localhost:3001 (with hot reload)

To run them separately: `npm run dev:api` / `npm run dev:ui`

---

### Step 7 — Create your first admin user

Once the API is running:

```bash
# Register an account
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!","displayName":"Admin"}'
```

Grant admin role in MongoDB:
```bash
# If using Docker:
docker exec -it zeroauth-mongodb mongosh -u admin -p password

# If local:
mongosh

# Then in the shell:
use zeroauth
db.users.updateOne(
  { email: "admin@example.com" },
  { $addToSet: { roles: "admin" } }
)
```

Now log in at http://localhost:3001/login — the admin panel is at http://localhost:3001/admin.

---

### Step 8 — Enable auth methods from the admin panel

1. Go to http://localhost:3001/admin/settings/auth
2. Toggle on any auth methods you want (Google, GitHub, Magic Links, Passkeys, TOTP)
3. For OAuth: add credentials to `.env` and restart the API
4. For email features (magic links, OTP): set `MAIL_*` vars in `.env`

---

## Environment variables

```bash
# ── Required ───────────────────────────────────────────────────────────────────
TOKEN_SECRET_HEX=           # openssl rand -hex 32
CSFLE_MASTER_KEY_HEX=       # openssl rand -hex 32
MONGO_URI=mongodb://localhost:27017/zeroauth

# ── OAuth (leave blank to disable) ─────────────────────────────────────────────
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=
OAUTH_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/oauth/google/callback

OAUTH_GITHUB_CLIENT_ID=
OAUTH_GITHUB_CLIENT_SECRET=
OAUTH_GITHUB_REDIRECT_URI=http://localhost:3000/auth/oauth/github/callback

# ── Email — magic links + OTP (uses nodemailer) ─────────────────────────────────
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=
MAIL_PASSWORD=
MAIL_FROM=noreply@yourapp.com

# ── SMS OTP (requires Twilio account) ──────────────────────────────────────────
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# ── Redis — distributed rate limiting ──────────────────────────────────────────
REDIS_URI=redis://localhost:6379

# ── App ────────────────────────────────────────────────────────────────────────
APP_NAME=My SaaS
APP_URL=http://localhost:3001
PORT=3000
NODE_ENV=development
```

---

## Project structure

```
.
├── src/                            # API backend (Express + TypeScript)
│   ├── api/
│   │   ├── server.ts               # Express app entry point
│   │   └── routes/
│   │       ├── auth.routes.ts      # Register, login, OAuth, token refresh
│   │       ├── magic-link.routes.ts
│   │       ├── mfa.routes.ts       # TOTP, email/SMS OTP
│   │       ├── passkey.routes.ts   # WebAuthn register + authenticate
│   │       ├── session.routes.ts   # List + revoke sessions
│   │       └── admin.routes.ts     # Users CRUD, settings, stats
│   ├── models/
│   │   ├── settings.model.ts       # ⭐ Feature flags singleton (SaaSSettings)
│   │   ├── user.model.ts
│   │   └── index.ts                # Session, Role, OTP, AuditLog, RefreshToken
│   ├── services/
│   │   └── magicLink.service.ts
│   └── middleware/
│       ├── auth.ts                 # Token verification, req.user
│       ├── accountLockout.ts       # Failed-login tracking
│       └── rateLimiting.ts         # Per-IP sliding window
├── packages/
│   └── ui/                         # Single Next.js app (port 3001)
│       └── src/app/
│           ├── page.tsx            # Landing page (hero, features, pricing)
│           ├── (auth)/             # /login /register /magic-link /callback
│           ├── dashboard/          # /dashboard + profile, security, sessions
│           └── admin/              # /admin — admin panel
│               ├── page.tsx        # Stats dashboard
│               ├── users/          # User management + detail view
│               ├── sessions/       # Active session browser
│               ├── audit/          # Audit log viewer
│               └── settings/
│                   ├── auth/       # ⭐ Auth method toggle panel
│                   └── general/    # App name, URL, branding
├── docker-compose.yml
├── .env.example
└── STARTER.md                      # This file
```

---

## Customizing the app

### Rename from "Acme" to your brand

Search for `Acme` across `packages/ui/src/` and replace with your company name. Key files:
- `src/app/page.tsx` — landing page hero + navbar
- `src/app/layout.tsx` — `<title>` metadata
- `src/app/dashboard/layout.tsx` — nav logo

### Change the brand color

Edit `packages/ui/tailwind.config.js`:
```js
colors: {
  brand: "#your-hex-color",  // default: #6366f1 (indigo)
}
```

Then replace `indigo-` with `brand-` across the UI files.

### Customize the landing page

Edit `packages/ui/src/app/page.tsx` — it's plain Tailwind, no component library.
Change the hero headline, feature cards, pricing tiers, and footer.

### Add your own API routes

```typescript
// src/api/server.ts
import myRoutes from "./routes/my.routes";
app.use("/api/my-feature", authMiddleware, myRoutes);
```

### Access the logged-in user

```typescript
// inside any route handler after authMiddleware
const userId = req.user._id;
const email = req.user.email;
const isAdmin = req.user.roles.includes("admin");
```

---

## Key API endpoints

```
POST   /auth/register
POST   /auth/login
POST   /auth/token/refresh
POST   /auth/logout
GET    /auth/me                             (auth required)

GET    /auth/oauth/google                  → redirects to Google
GET    /auth/oauth/google/callback
GET    /auth/oauth/github
GET    /auth/oauth/github/callback

POST   /auth/magic-link/send
POST   /auth/magic-link/verify

POST   /auth/passkey/register/options      (auth required)
POST   /auth/passkey/register/verify       (auth required)
POST   /auth/passkey/authenticate/options
POST   /auth/passkey/authenticate/verify

POST   /auth/mfa/totp/setup                (auth required)
POST   /auth/mfa/totp/verify               (auth required)
POST   /auth/mfa/otp/send                  (auth required)
POST   /auth/mfa/otp/verify                (auth required)

GET    /sessions                           (auth required)
DELETE /sessions/:id                       (auth required)

GET    /admin/stats                        (admin only)
GET    /admin/users                        (admin only)
GET    /admin/users/:id                    (admin only)
PUT    /admin/users/:id                    (admin only)
DELETE /admin/users/:id                    (admin only)
POST   /admin/users/:id/logout             (admin only)
GET    /admin/settings                     (admin only)
PUT    /admin/settings                     (admin only)

GET    /healthz
GET    /docs                               (Swagger UI — dev only)
```

---

## SaaS roadmap — what to build next

This starter handles auth end-to-end. Everything below is what a real SaaS product needs on top of it.

### Billing & Subscriptions

- [ ] **Stripe integration** — subscriptions, one-time charges, setup intents
- [ ] **Pricing tier model** — free, pro, enterprise stored per user/org
- [ ] **Feature gates** — check plan before allowing access to paid features
- [ ] **Usage counters** — track seats, API calls, storage, etc. per billing period
- [ ] **Stripe Customer Portal** — let users manage cards, cancel, download invoices
- [ ] **Stripe webhook handler** — react to `subscription.updated`, `invoice.payment_failed`, `customer.subscription.deleted`
- [ ] **Trial period** — 14-day trial with automated expiry and upgrade prompt
- [ ] **Upgrade/downgrade flows** — proration, immediate vs end-of-cycle

### Organizations & Teams

- [ ] **Workspace model** — one org can have many members, one user can belong to many orgs
- [ ] **Invite by email** — time-limited invite links (signed tokens)
- [ ] **Org roles** — owner, admin, member, viewer with permission checks
- [ ] **Transfer ownership** — reassign org owner with confirmation flow
- [ ] **Org settings page** — name, logo, slug, billing contact
- [ ] **Per-org billing** — one Stripe subscription per organization
- [ ] **Remove / leave org** — with safety checks (can't remove last owner)

### Email

- [ ] **Transactional email templates** — welcome, email verify, invite, receipt, password reset, trial expiry
- [ ] **React Email or MJML** — proper HTML email templates, not raw HTML strings
- [ ] **Email queue** — queue + retry with Bull/BullMQ so sending never blocks a request
- [ ] **Notification preferences** — users choose which emails they receive
- [ ] **Unsubscribe tokens** — one-click unsubscribe with signed tokens (CAN-SPAM)

### File Storage & Uploads

- [ ] **Avatar upload** — profile pictures, resize + optimize, store to S3/R2
- [ ] **File attachments** — per-feature file uploads with type/size validation
- [ ] **S3-compatible storage** — AWS S3, Cloudflare R2, or MinIO (local dev)
- [ ] **Pre-signed URLs** — secure direct-to-storage uploads from the browser
- [ ] **CDN delivery** — serve files from edge for fast global access

### Onboarding

- [ ] **Welcome email** — sent immediately after registration
- [ ] **Setup checklist** — "complete your profile", "invite a teammate", "add billing" with progress tracking
- [ ] **Empty states** — every list/table has a helpful empty state with a CTA
- [ ] **Product tour** — lightweight tooltip walkthrough on first login (Shepherd.js or Driver.js)
- [ ] **Onboarding completion event** — fire analytics event + notify sales/Slack on new signups

### In-app Notifications

- [ ] **Notification model** — store notifications per user with `read`/`unread` state
- [ ] **Bell icon + dropdown** — notification center UI in the dashboard nav
- [ ] **Mark as read** — single and bulk mark-read
- [ ] **Real-time delivery** — Server-Sent Events (SSE) or WebSocket push
- [ ] **Email fallback** — deliver via email if user hasn't visited in N days

### Developer API Keys

- [ ] **API key model** — named keys, hashed (never store plain), scopes, per-user or per-org
- [ ] **Key creation UI** — generate key, show once, copy to clipboard
- [ ] **Usage tracking** — count requests per key, show last-used timestamp
- [ ] **Rotate / revoke** — instant revocation, forced rotation policy
- [ ] **Key scopes** — e.g. `read:data`, `write:data`, `admin` — enforced in middleware

### Webhooks (user-facing)

- [ ] **Webhook endpoint management** — users add/edit/delete their own webhook URLs
- [ ] **Event catalog** — define all events your platform emits (`user.created`, `payment.succeeded`, etc.)
- [ ] **Signed payloads** — HMAC-SHA256 signature header so receivers can verify
- [ ] **Delivery logs** — show each attempt, response status, retry count
- [ ] **Retry with backoff** — automatic retry on 5xx or timeout, up to 3 days

### Feature Flags & Plan Limits

- [ ] **Entitlement table** — map plan → features + limits (e.g. free: 3 projects, pro: unlimited)
- [ ] **Gate middleware** — `requirePlan("pro")` or `requireEntitlement("feature_x")`
- [ ] **Upgrade prompt component** — consistent "upgrade to Pro" modal/banner across the UI
- [ ] **Gradual rollout flags** — enable features for a % of users or specific accounts
- [ ] **Override flags** — admin can force-enable for specific users (for trials, support, etc.)

### Analytics & Reporting

- [ ] **Product analytics** — PostHog or Plausible for page views + feature usage events
- [ ] **Revenue dashboard** — MRR, ARR, churn rate, LTV in the admin panel
- [ ] **Funnel tracking** — signup → activation → paid conversion
- [ ] **Per-user usage stats** — API calls, storage used, seats, etc. on the user's billing page
- [ ] **Export to CSV** — admin can export user list, revenue data

### Admin Enhancements

- [ ] **Impersonate user** — admin can log in as any user for support (with audit log entry)
- [ ] **Broadcast email** — send announcement to all users or filtered segments
- [ ] **Manual plan override** — bump a user to pro, add trial days, apply coupon
- [ ] **Feature flag management UI** — toggle rollout flags per-user or globally from admin
- [ ] **Revenue metrics** — MRR, active subscriptions, failed payments at a glance

### Error Monitoring & Observability

- [ ] **Sentry** — client-side error boundaries + server-side exception capture
- [ ] **Structured logging** — already have Elasticsearch; add dashboards for error rate, latency
- [ ] **Health status page** — public status.yourapp.com using a simple uptime check
- [ ] **Alerting** — Elasticsearch watcher or PagerDuty/Slack alert on error spike or latency breach
- [ ] **Distributed tracing** — already have OpenTelemetry; wire up a trace viewer (Jaeger/Tempo)

### SEO & Marketing

- [ ] **Blog or changelog** — MDX-based pages under `/blog` and `/changelog`
- [ ] **Proper meta tags** — `<title>`, `<meta description>`, Open Graph, Twitter cards on every page
- [ ] **Sitemap.xml + robots.txt** — generated at build time from Next.js
- [ ] **Cookie consent banner** — GDPR-compliant banner with accept/reject (use `react-cookie-consent`)
- [ ] **Analytics script** — Plausible or Google Analytics with consent gate

### Legal & Compliance

- [ ] **Privacy policy page** — `/privacy` with your actual policy (not placeholder)
- [ ] **Terms of service page** — `/terms`
- [ ] **GDPR data export** — `/dashboard/settings` → "Export my data" downloads JSON zip
- [ ] **Account deletion** — 30-day soft-delete grace period, then purge all PII
- [ ] **Data retention policy** — auto-purge audit logs and old sessions after N days

### CI/CD & Deployment

- [ ] **GitHub Actions** — lint + type-check + test on every PR
- [ ] **Docker production build** — multi-stage Dockerfile, push to ghcr.io or Docker Hub
- [ ] **One-click deploy** — Railway / Render / Fly.io deploy button in this README
- [ ] **Environment parity** — staging environment that mirrors production config
- [ ] **DB backup** — daily MongoDB dump to S3 with 30-day retention
- [ ] **Secret rotation** — document how to rotate TOKEN_SECRET_HEX without downtime

### UI & UX

- [ ] **Dark / light mode toggle** — system preference detection + manual override, persisted
- [ ] **Toast notification system** — global toast context for success/error feedback
- [ ] **Loading skeletons** — skeleton screens instead of spinners for better perceived performance
- [ ] **Mobile-responsive dashboard** — all pages usable on phone (currently desktop-first)
- [ ] **Keyboard navigation** — focus rings, skip-to-main, ARIA roles on modals and dropdowns
- [ ] **Internationalization (i18n)** — next-intl setup with English as default, ready for translations

### Customer Support

- [ ] **Live chat widget** — Crisp, Intercom, or Tawk.to embed in dashboard layout
- [ ] **Help center** — `/help` with searchable FAQ (Mintlify, GitBook, or plain MDX)
- [ ] **In-app feedback** — thumbs up/down or NPS survey triggered after key actions
- [ ] **Support ticket model** — lightweight ticket system if you don't want a third-party tool
