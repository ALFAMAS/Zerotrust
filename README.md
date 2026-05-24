# ZeroAuth - Zero-Trust Authentication & Authorization System

A production-grade, zero-trust authentication and authorization system built with TypeScript, Mongoose, and modern cryptographic standards. Designed for enterprise security with continuous access evaluation, device attestation, and comprehensive audit logging.

## 🎯 Key Features

### Authentication

- ✅ **OAuth 2.0 Integration** - Google, Facebook, GitHub, Apple (provider-agnostic framework)
- ✅ **Multi-Factor Authentication** - TOTP, WebAuthn/Passkeys, with email/SMS/WhatsApp/Telegram channels
- ✅ **Passwordless Authentication** - Passkeys with hardware-backed device attestation
- ✅ **PASETO v4.local Tokens** - Platform-agnostic security tokens (no JWT confusion vulnerabilities)
- ✅ **Cryptographic Session Binding** - Proof-of-Possession validation to prevent token theft

### Authorization

- ✅ **Attribute-Based Access Control (ABAC)** - Dynamic, context-aware access decisions
- ✅ **Role-Based Access Control (RBAC)** - Hierarchical roles with permission inheritance
- ✅ **Just-In-Time (JIT) Privilege Escalation** - Temporal privilege grants with auto-revocation
- ✅ **Continuous Access Evaluation** - Real-time risk assessment and policy enforcement

### Security

- ✅ **Client-Side Field Level Encryption (CSFLE)** - Transparent encryption for sensitive data
- ✅ **Device Fingerprinting** - Detect compromised endpoints mid-session
- ✅ **Device Attestation** - WebAuthn hardware verification
- ✅ **Shared Signals Framework (SSF)** - Receive/transmit compromise signals
- ✅ **Rate Limiting** - Multi-layer (in-memory, Redis, IP-based)
- ✅ **Geo-fencing** - Geographic and IP-based access control

### Observability

- ✅ **Immutable Audit Logging** - Complete forensic trail to Elasticsearch
- ✅ **Structured JSON Logging** - ELK stack integration
- ✅ **Correlation IDs** - Request tracing across services
- ✅ **Real-time Alerting** - Elasticsearch alerting rules

## 🚀 Quick Start

### Option A — Docker (recommended, zero setup)

**Prerequisites:** Docker Desktop installed and running.

```bash
# 1. Clone the saas-starter branch
git clone https://github.com/ALFAMAS/zeroauth -b saas-starter my-saas
cd my-saas

# 2. Generate two random 32-byte secrets
openssl rand -hex 32   # copy → TOKEN_SECRET_HEX
openssl rand -hex 32   # copy → CSFLE_MASTER_KEY_HEX

# 3. Create your .env
cp .env.example .env
# Fill in the two keys above + any OAuth credentials

# 4. Start everything
docker compose up -d

# 5. Watch logs until the API is healthy
docker compose logs -f zeroauth
# You'll see: "Server listening on http://localhost:3000"
```

Services will be available at:

| Service | URL |
|---------|-----|
| App + Admin (Next.js) | http://localhost:3001 |
| Admin panel | http://localhost:3001/admin |
| API (Express) | http://localhost:3000 |
| API docs (Swagger) | http://localhost:3000/docs |
| Elasticsearch | http://localhost:9200 |
| Kibana | http://localhost:5601 |

To stop: `docker compose down` — To wipe data: `docker compose down -v`

---

### Option B — Local development (no Docker)

**Prerequisites:** Node.js 18+, MongoDB 7 running locally (or Atlas), Redis 7 (optional).

```bash
# 1. Clone
git clone https://github.com/ALFAMAS/zeroauth -b saas-starter my-saas
cd my-saas

# 2. Install dependencies
npm install
cd packages/ui && npm install && cd ../..

# 3. Generate secrets
openssl rand -hex 32   # → TOKEN_SECRET_HEX
openssl rand -hex 32   # → CSFLE_MASTER_KEY_HEX

# 4. Configure environment
cp .env.example .env
# Minimum required:
#   TOKEN_SECRET_HEX=<key>
#   CSFLE_MASTER_KEY_HEX=<key>
#   MONGO_URI=mongodb://localhost:27017/zeroauth

# 5. Start API + UI together (concurrently)
npm run dev
# API  → http://localhost:3000  (hot reload)
# UI   → http://localhost:3001  (hot reload)

# Run individually if needed
npm run dev:api   # API only
npm run dev:ui    # UI only
```

---

### Step 3 — Create your first admin user

```bash
# Register an account
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!","displayName":"Admin"}'

# Grant admin role in MongoDB
# Docker:
docker exec -it zeroauth-mongodb mongosh -u admin -p password
# Local:
mongosh

# Then in the shell:
use zeroauth
db.users.updateOne(
  { email: "admin@example.com" },
  { $addToSet: { roles: "admin" } }
)
```

Log in at http://localhost:3001/login — admin panel at http://localhost:3001/admin.

---

### Step 4 — Enable auth methods

1. Go to **http://localhost:3001/admin/settings/auth**
2. Toggle on Google, GitHub, Magic Links, Passkeys, TOTP, etc.
3. For OAuth: add `OAUTH_*` credentials to `.env` and restart the API
4. For email (magic links, OTP): set `MAIL_*` vars in `.env`

---

### Run tests / build

```bash
npm run test          # vitest
npm run test:coverage
npm run build         # tsc → dist/
npm run type-check    # tsc --noEmit
```

## 📁 Project Structure

```
src/
├── config/              # Environment configuration management
├── crypto/              # CSFLE encryption management
├── db/                  # MongoDB connection & health checks
├── logger/              # Structured logging infrastructure
├── models/              # Mongoose schemas (User, Session, Role, etc.)
├── services/            # Core services (Authorization, Token, Fingerprinting)
├── middleware/          # Express middleware (auth, validation, rate limiting)
├── api/                 # REST API routes (Phase 2)
├── oauth/               # OAuth provider implementations (Phase 2)
├── mfa/                 # MFA channel implementations (Phase 2)
├── audit/               # Audit logging to Elasticsearch (Phase 4)
├── ssf/                 # Shared Signals Framework (Phase 4)
├── workload/            # Workload identity credentials (Phase 4)
└── shared/types.ts      # Central type definitions
```

## 🔐 Configuration

All configuration is environment-based. See `.env.example` for complete options.

### Critical Security Keys

Generate secure random keys:

```bash
# Generate 32-byte random key (64 hex chars)
openssl rand -hex 32
```

Set these in `.env`:

```
TOKEN_SECRET_HEX=<32-byte random key>
CSFLE_MASTER_KEY_HEX=<32-byte random key>
```

### OAuth Setup

Configure OAuth providers in `.env`:

```
OAUTH_GOOGLE_CLIENT_ID=your-client-id
OAUTH_GOOGLE_CLIENT_SECRET=your-client-secret
OAUTH_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/oauth/google/callback
```

### MFA Channels

Enable desired channels:

```
MFA_EMAIL_ENABLED=true
MFA_SMS_ENABLED=false
MFA_WHATSAPP_ENABLED=false
MFA_TELEGRAM_ENABLED=false
```

## 🏗️ Architecture

### Authentication Flow

```
┌─ User Registration ─────────────┐
│  1. Email/phone verification    │
│  2. Password hash + CSFLE       │
│  3. Optional: Passkey enroll    │
└────────────────────────────────┘
                ↓
┌─ Login Challenge ──────────────┐
│  1. Email/password OR passkey   │
│  2. MFA challenge (if enabled)  │
│  3. Device fingerprinting       │
│  4. Proof-of-possession gen     │
└────────────────────────────────┘
                ↓
┌─ Token Generation ─────────────┐
│  1. PASETO v4.local encryption  │
│  2. Cryptographic binding       │
│  3. Session creation            │
│  4. Refresh token issuance      │
└────────────────────────────────┘
```

### Authorization Flow

```
Request → Auth Middleware
  ├─ Token verification (PASETO)
  ├─ Session validation
  ├─ Device fingerprint check
  └─ Proof-of-possession validation

  ↓

Continuous Evaluation Middleware
  ├─ Schedule restriction check
  ├─ Geofencing validation
  ├─ Risk score calculation
  ├─ ABAC condition evaluation
  └─ Decision: Allow | Deny | Challenge

  ↓

Access Granted / Denied
  └─ Audit log created
```

### CSFLE Implementation

Sensitive fields are transparently encrypted:

- Email, phone, password hash
- TOTP secrets, OAuth tokens
- User attributes

Encryption is handled by Mongoose pre-save/post-retrieve hooks.

## 🔄 Implementation Phases

### Phase 1 ✅ (Foundation - Complete)

- [x] Configuration management
- [x] Database connection layer
- [x] CSFLE encryption foundation
- [x] Structured logging
- [x] Root entry point
- [x] Shared type definitions
- [x] Docker setup

### Phase 2 (API & OAuth - In Progress)

This phase implements the REST surface, OAuth provider integrations, and MFA channel adapters. Each item below lists the purpose, files to add or modify, security considerations, and tests to implement.

- REST API endpoints
  - Purpose: Provide the HTTP endpoints for registration, login, OAuth callbacks, MFA enrollment/verification, passkey flows, token management, password reset, and session management.
  - Files: `src/api/routes/auth.routes.ts`, `src/api/server.ts`, `src/api/routes/session.routes.ts`, `src/api/routes/mfa.routes.ts`, `src/api/routes/oauth.routes.ts`
  - Key behaviors: Input validation, CSFLE-safe persistence, audit logging for security-sensitive actions, proper error codes, idempotency where applicable.
  - Security: Rate-limit high-risk endpoints (login, password reset), require state/nonce for OAuth, implement PKCE for public clients, always validate redirect URIs.
  - Tests: Unit tests for controllers, integration tests for end-to-end flows (register → login → access protected resource).

- OAuth provider factory
  - Purpose: Provider-agnostic abstraction to add providers (Google, Facebook, GitHub, Apple) via configuration rather than code changes.
  - Files: `src/oauth/provider.factory.ts`, `src/oauth/providers/google.ts`, `src/oauth/providers/facebook.ts`, etc.
  - Key behaviors: Exchange authorization code, fetch user profile, normalize provider claims, link or create user accounts, store provider metadata encrypted by CSFLE.
  - Security: Validate provider tokens signature if present, rotate stored refresh tokens, log provider actions to audit, honor Shared Signals Framework signals from providers.
  - Tests: Provider adapter unit tests that mock provider responses and normalized user mapping.

- MFA channel implementations
  - Purpose: Modular channel adapters to send OTPs or messages via Email, SMS (Twilio), WhatsApp (Twilio), Telegram.
  - Files: `src/mfa/channels/email.ts`, `src/mfa/channels/sms.ts`, `src/mfa/channels/whatsapp.ts`, `src/mfa/channels/telegram.ts`, `src/mfa/index.ts`
  - Key behaviors: Retry/backoff, attempt counters, channel-specific rate limits, secure templating for OTPs, recovery/backup code issuance.
  - Security: Never log OTPs; store OTP attempts and expiry; require biometric or identity-proof step-up for high-privilege recovery.
  - Tests: Channel mocks, delivery simulation, and rate-limit enforcement tests.

- Request validation middleware
  - Purpose: Central input-validation using Zod or Joi to validate body, query, and params for every route.
  - Files: `src/middleware/validation.ts`, `src/api/schemas/*.ts`
  - Key behaviors: Strong validation rules for email, phone, password complexity, passkey attestation objects; return consistent error format.
  - Tests: Schema unit tests and integration tests exercising invalid inputs.

### Phase 3 (Middleware & Evaluation - In Progress)

Phase 3 is the core runtime protection layer. Several middleware components have been scaffolded; remaining items describe responsibilities and implementation notes.

- Auth middleware (token verification)
  - Purpose: Verify PASETO v4.local access tokens, token binding (proof-of-possession), session validity, and user status.
  - Files: `src/middleware/auth.ts` (implemented), ensure `initAuthMiddleware()` is called at server startup.
  - Key behaviors: Reject expired/revoked sessions, update lastActivityAt, attach `req.user`, `req.session`, and `req.token` to request.
  - Tests: Token creation & verification unit tests, expired/revoked session tests.

- Device attestation middleware
  - Purpose: Compute device fingerprint, compare with session fingerprint, flag anomalies, and optionally require re-authentication or step-up.
  - Files: `src/middleware/deviceAttestation.ts` (implemented), `src/services/fingerprint.service.ts`
  - Key behaviors: Support strict and permissive modes; preserve audit trail; support marking device as trusted after step-up.
  - Tests: Fingerprint variation tests, device-change workflows.

- Continuous access evaluation
  - Purpose: Real-time ABAC evaluation and risk scoring per request, enforced at the gateway or app layer.
  - Files: `src/middleware/continuousEval.ts` (implemented), `src/services/authz.service.ts`
  - Key behaviors: Aggregate anomaly signals (device, location, time), evaluate ABAC conditions, calculate risk score, return allow/deny/challenge decisions, require MFA step-up for elevated risk.
  - Tests: ABAC condition evaluation scenarios, risk threshold boundary tests.

- Rate limiting (mixed strategy)
  - Purpose: Protect against brute-force and credential stuffing using a layered approach:
    - Fast in-memory token bucket for single-process low-latency checks
    - Redis-backed token bucket for distributed deployments
    - IP-based sliding window counters for suspicious IP tracking
  - Files: `src/middleware/rateLimiting.ts`, `src/services/rateLimiter/redis.ts`, `src/services/rateLimiter/inmemory.ts`
  - Key behaviors: Per-endpoint configurable thresholds, global login limits, exponential backoff and temporary bans, audit and alert on abuse.
  - Security: Back-pressure to slow attackers without denying legitimate users; ensure Redis keys are namespaced and TTL'd.
  - Tests: Simulate bursts, distributed enforcement with mocked Redis.

- Temporal access control
  - Purpose: Enforce schedule-based restrictions via ABAC/time checks and JIT expiry enforcement.
  - Files: `src/middleware/temporalAccess.ts`, use `session.sessionConfig.scheduleRestriction` and `JITModel` for active grants
  - Key behaviors: Timezone-aware checks, auto-revoke expired JIT grants, block out-of-window access.
  - Tests: Timezone edge-case tests and JIT grant lifecycle tests.

- Geo-fencing
  - Purpose: Restrict access by country or IP subnet and detect suspicious geolocation changes.
  - Files: `src/middleware/geoFencing.ts`, use `geoip-lite` service and optional IP reputation services
  - Key behaviors: Country allow-lists, subnet checks, VPN/proxy heuristics, immediate revocation on critical compromise signals.
  - Tests: Geo rule enforcement and proxy/VPN heuristics tests.

### Phase 4 (Observability & Hardening - In Progress)

Phase 4 focuses on telemetry, external integrations, workload identities, and resilience testing.

- Audit logging to Elasticsearch
  - Purpose: Immutable, filterable forensic logs for all critical system actions.
  - Files: `src/audit/index.ts`, integration with `src/logger/index.ts` streaming into ES
  - Key behaviors: Append-only store, index mappings for fast queries (actor, action, timestamps, device metadata), retention & export policies.
  - Security: Mask sensitive fields in logs, ensure log pipeline integrity and access controls to ES.
  - Tests: Verify log entries created for each critical action and indexed into ES (integration test with test ES instance).

- Shared Signals Framework (SSF)
  - Purpose: Full bidirectional SSF integration to receive provider compromise signals and transmit local signals upstream.
  - Files: `src/ssf/receiver.ts`, `src/ssf/sender.ts`, webhook endpoint `POST /ssf/events`
  - Key behaviors: Accept SET (Security Event Token) payloads, validate signatures, map events to sessions/users, trigger automated revocation or alerts, and transmit local SETs for critical events.
  - Tests: Verify SET parsing, signature validation, and automated actions on simulated signals.

- Workload identity credentials
  - Purpose: Short-lived, ephemeral credentials for non-human identities (CI, agents, AI workloads) with least-privilege scopes.
  - Files: `src/workload/index.ts`, `src/api/routes/workload.routes.ts`
  - Key behaviors: Issue scoped tokens with short TTLs, rotate secrets, provide audit trail for all workload actions, support token exchange flows.
  - Security: Enforce usage policies, IP and time restrictions for workload tokens, and strong rotation policies.
  - Tests: Token issuance, rotation, scope enforcement, and TTL expiry tests.

- Security headers middleware & hardening
  - Purpose: Enforce HTTP headers and runtime hardening (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy).
  - Files: `src/middleware/securityHeaders.ts`, integrated into `src/api/server.ts`
  - Tests: Verify headers are returned, CSP coverage tests.

- Load and chaos testing
  - Purpose: Validate resilience under load and failure modes (DB failover, Redis outage, network partition, event flood).
  - Tools: k6 or Artillery for load tests, Chaos Toolkit for fault injection, custom scripts for session revocation across nodes.
  - Tests: Authenticate at scale, refresh token storms, session revocation cascade, rate limiter efficacy, and SSF flood handling.

## 🧪 Testing

```bash
# Run all tests
bun run test

# Watch mode
bun run test:watch

# Coverage report
bun run test:coverage

# Run specific test file
bun run test src/__tests__/unit/token.test.ts
```

## 📊 Monitoring

### Elasticsearch / Kibana

Audit logs are automatically indexed in Elasticsearch:

- **Index Pattern**: `zeroauth-audit-YYYY-MM-DD`
- **Access**: http://localhost:5601

Create dashboards to monitor:

- Authentication success/failure rates
- MFA adoption
- Access denied patterns
- Device fingerprint anomalies
- Rate limit violations

### Application Logs

JSON logs are streamed to Elasticsearch:

```bash
# Check logs in Kibana
# Index Pattern: zeroauth-logs-YYYY-MM-DD
```

## 🔒 Security Best Practices

1. **Never commit `.env` files** - Use `.env.example` as template
2. **Rotate encryption keys regularly** - Set `CSFLE_KEY_ROTATION_DAYS`
3. **Use strong random secrets** - Min 32 bytes for TOKEN_SECRET_HEX
4. **Enable HTTPS in production** - Don't run over HTTP
5. **Monitor audit logs continuously** - Set up Elasticsearch alerts
6. **Keep dependencies updated** - Run `npm audit` regularly

## 📚 API Documentation

Coming in Phase 2. Will include:

- OpenAPI/Swagger spec
- Endpoint documentation
- Request/response examples
- OAuth flow diagrams
- WebAuthn registration guide

## 🤝 Contributing

1. Follow TypeScript strict mode
2. Add tests for new features
3. Update CHANGELOG
4. Run `npm run lint` and `npm run format` before committing

## 📝 License

[Add your license here]

## 🆘 Troubleshooting

### MongoDB Connection Issues

```bash
# Check MongoDB logs
docker-compose logs mongodb

# Verify connection
docker-compose exec mongodb mongosh -u admin -p password
```

### CSFLE Key Errors

```bash
# Regenerate encryption keys
openssl rand -hex 32 > .env  # Update TOKEN_SECRET_HEX and CSFLE_MASTER_KEY_HEX
docker-compose restart zeroauth
```

### Rate Limiting Not Working

Ensure Redis is running and accessible:

```bash
docker-compose exec redis redis-cli ping
```

## 📞 Support

For issues and questions:

- GitHub Issues: [repo/issues]
- Documentation: [docs link]
- Security: mas.arafat.dev@gmail.com

---

## 🗺️ SaaS Product Roadmap

Auth is solved. Below is everything a real SaaS product needs on top of this foundation — organized by category with individual todo items.

### Billing & Subscriptions

- [ ] **Stripe integration** — subscriptions, one-time charges, setup intents
- [ ] **Pricing tier model** — free, pro, enterprise stored per user/org
- [ ] **Feature gates** — check plan before allowing access to paid features
- [ ] **Usage counters** — track seats, API calls, storage per billing period
- [ ] **Stripe Customer Portal** — let users manage cards, cancel, download invoices
- [ ] **Stripe webhook handler** — react to `subscription.updated`, `invoice.payment_failed`, `customer.subscription.deleted`
- [ ] **Trial period** — 14-day trial with automated expiry and upgrade prompt
- [ ] **Upgrade/downgrade flows** — proration, immediate vs end-of-cycle

### Organizations & Teams

- [ ] **Workspace model** — one org → many members, one user → many orgs
- [ ] **Invite by email** — time-limited signed invite links
- [ ] **Org roles** — owner, admin, member, viewer with permission checks
- [ ] **Transfer ownership** — reassign org owner with confirmation flow
- [ ] **Org settings page** — name, logo, slug, billing contact
- [ ] **Per-org billing** — one Stripe subscription per organization
- [ ] **Remove / leave org** — with safety checks (can't remove last owner)

### Email

- [ ] **Transactional email templates** — welcome, verify, invite, receipt, password reset, trial expiry
- [ ] **React Email or MJML** — proper HTML templates, not raw strings
- [ ] **Email queue** — Bull/BullMQ so sending never blocks a request
- [ ] **Notification preferences** — users choose which emails they receive
- [ ] **Unsubscribe tokens** — one-click unsubscribe with signed tokens (CAN-SPAM)

### File Storage & Uploads

- [ ] **Avatar upload** — resize + optimize, store to S3/R2
- [ ] **File attachments** — per-feature uploads with type/size validation
- [ ] **S3-compatible storage** — AWS S3, Cloudflare R2, or MinIO for local dev
- [ ] **Pre-signed URLs** — secure direct-to-storage uploads from the browser
- [ ] **CDN delivery** — serve files from edge for fast global access

### Onboarding

- [ ] **Welcome email** — sent immediately after registration
- [ ] **Setup checklist** — complete profile, invite teammate, add billing — with progress tracking
- [ ] **Empty states** — every list/table has a helpful empty state with CTA
- [ ] **Product tour** — lightweight tooltip walkthrough on first login (Shepherd.js / Driver.js)
- [ ] **Onboarding completion event** — fire analytics event + Slack notify on new signups

### In-app Notifications

- [ ] **Notification model** — per-user with `read`/`unread` state
- [ ] **Bell icon + dropdown** — notification center UI in dashboard nav
- [ ] **Mark as read** — single and bulk
- [ ] **Real-time delivery** — Server-Sent Events (SSE) or WebSocket push
- [ ] **Email fallback** — deliver via email if user hasn't visited in N days

### Developer API Keys

- [ ] **API key model** — named, hashed (never store plain), scoped, per-user or per-org
- [ ] **Key creation UI** — generate key, show once, copy to clipboard
- [ ] **Usage tracking** — request count per key, last-used timestamp
- [ ] **Rotate / revoke** — instant revocation, forced rotation policy
- [ ] **Key scopes** — `read:data`, `write:data`, `admin` — enforced in middleware

### Webhooks (user-facing)

- [ ] **Webhook endpoint management** — users add/edit/delete their own URLs
- [ ] **Event catalog** — define all events your platform emits
- [ ] **Signed payloads** — HMAC-SHA256 signature header
- [ ] **Delivery logs** — show each attempt, response status, retry count
- [ ] **Retry with backoff** — automatic retry on 5xx/timeout, up to 3 days

### Feature Flags & Plan Limits

- [ ] **Entitlement table** — map plan → features + limits
- [ ] **Gate middleware** — `requirePlan("pro")` or `requireEntitlement("feature_x")`
- [ ] **Upgrade prompt component** — consistent "upgrade to Pro" modal/banner
- [ ] **Gradual rollout flags** — enable features for % of users or specific accounts
- [ ] **Override flags** — admin force-enables for specific users (trials, support)

### Analytics & Reporting

- [ ] **Product analytics** — PostHog or Plausible for page views + feature usage events
- [ ] **Revenue dashboard** — MRR, ARR, churn rate, LTV in admin panel
- [ ] **Funnel tracking** — signup → activation → paid conversion
- [ ] **Per-user usage stats** — API calls, storage, seats on billing page
- [ ] **Export to CSV** — admin exports user list and revenue data

### Admin Enhancements

- [ ] **Impersonate user** — log in as any user for support (with audit log entry)
- [ ] **Broadcast email** — send announcement to all users or filtered segments
- [ ] **Manual plan override** — bump user to pro, add trial days, apply coupon
- [ ] **Feature flag management UI** — toggle rollout flags per-user or globally
- [ ] **Revenue metrics** — MRR, active subscriptions, failed payments at a glance

### Error Monitoring & Observability

- [ ] **Sentry** — client-side error boundaries + server-side exception capture
- [ ] **Health status page** — public `status.yourapp.com` uptime check
- [ ] **Alerting** — Elasticsearch watcher or PagerDuty/Slack on error spike or latency breach
- [ ] **Distributed tracing** — OpenTelemetry already wired; add Jaeger/Tempo trace viewer

### SEO & Marketing

- [ ] **Blog or changelog** — MDX pages under `/blog` and `/changelog`
- [ ] **Proper meta tags** — `<title>`, Open Graph, Twitter cards on every page
- [ ] **Sitemap.xml + robots.txt** — generated at build time from Next.js
- [ ] **Cookie consent banner** — GDPR-compliant accept/reject
- [ ] **Analytics script** — Plausible or Google Analytics with consent gate

### Legal & Compliance

- [ ] **Privacy policy page** — `/privacy`
- [ ] **Terms of service page** — `/terms`
- [ ] **GDPR data export** — "Export my data" downloads JSON zip
- [ ] **Account deletion** — 30-day soft-delete grace period, then purge all PII
- [ ] **Data retention policy** — auto-purge audit logs and old sessions after N days

### CI/CD & Deployment

- [ ] **GitHub Actions** — lint + type-check + test on every PR
- [ ] **Docker production build** — multi-stage Dockerfile, push to ghcr.io
- [ ] **One-click deploy** — Railway / Render / Fly.io deploy button in this README
- [ ] **Environment parity** — staging environment that mirrors production
- [ ] **DB backup** — daily MongoDB dump to S3 with 30-day retention
- [ ] **Secret rotation** — document how to rotate TOKEN_SECRET_HEX without downtime

### UI & UX

- [ ] **Dark / light mode toggle** — system preference detection + manual override, persisted
- [ ] **Toast notification system** — global toast context for success/error feedback
- [ ] **Loading skeletons** — skeleton screens instead of spinners
- [ ] **Mobile-responsive dashboard** — all pages usable on phone
- [ ] **Keyboard navigation** — focus rings, skip-to-main, ARIA roles on modals and dropdowns
- [ ] **Internationalization (i18n)** — next-intl with English default, ready for translations

### Customer Support

- [ ] **Live chat widget** — Crisp, Intercom, or Tawk.to embed in dashboard layout
- [ ] **Help center** — `/help` searchable FAQ (Mintlify, GitBook, or plain MDX)
- [ ] **In-app feedback** — thumbs up/down or NPS survey after key actions
- [ ] **Support ticket model** — lightweight tickets if you don't want a third-party tool

### Loyalty & Rewards System

- [ ] **Points model** — `UserPoints` collection: balance, lifetime total, expiry date per user
- [ ] **Earning rules engine** — configurable rules: daily login (+10 pts), referral signup (+200 pts), first payment (+500 pts), plan anniversary (+250 pts), profile complete (+50 pts), leaving a review (+100 pts)
- [ ] **Tier system** — Bronze (0–999), Silver (1 000–4 999), Gold (5 000–19 999), Platinum (20 000+); tier re-evaluated on every points change
- [ ] **Tier benefits** — perks per tier: extra API quota, storage bonus, priority support badge, discount %, extended session TTL
- [ ] **Redemption catalog** — spend points on: account credit (100 pts = $1), feature unlock, extended trial, plan upgrade, swag codes
- [ ] **Points history page** — timestamped ledger of every earn and spend event
- [ ] **Expiry policy** — points expire after 12 months of inactivity; warning email at 30 days
- [ ] **Birthday & anniversary bonuses** — auto-award on account anniversary and user birthday
- [ ] **Referral multiplier** — referred users earn 1.5× points in their first 90 days
- [ ] **Admin controls** — manually award/deduct points, bulk-award to a segment, adjust tier thresholds
- [ ] **Leaderboard** — opt-in public leaderboard of top earners (anonymized option)
- [ ] **Points badge on profile** — tier badge and point count in dashboard nav

### Referral & Affiliate Program

- [ ] **Referral link generator** — unique signed short-link per user (`yourapp.com/r/abc123`)
- [ ] **Referral tracking** — cookie + UTM attribution, store `referredBy` on new user
- [ ] **Referral rewards** — referrer gets credit/points when referee converts; referee gets discount
- [ ] **Referral dashboard** — clicks, signups, conversions per link
- [ ] **Affiliate portal** — `/affiliate` section with unique codes, commission rates, payout history
- [ ] **Payout integration** — Stripe Connect, PayPal Payouts, or Wise on the 1st of each month
- [ ] **Fraud detection** — flag self-referrals (same IP/device), churn-within-7-days referrals

### Gamification & Engagement

- [ ] **Achievement badges** — "First Login", "Power User" (30-day streak), "Team Player" (5 invites), "Early Adopter"
- [ ] **Streak tracking** — daily login streak with grace period; shown in dashboard
- [ ] **Progress bars** — onboarding %, profile completeness %, plan usage %
- [ ] **Weekly challenges** — opt-in challenges with point rewards on completion
- [ ] **Level-up notifications** — in-app + email when user crosses a tier threshold
- [ ] **Social sharing** — "I just reached Gold tier!" OG image generated with Satori

### White-labeling & Custom Domains

- [ ] **Custom domain per tenant** — orgs map `app.theirdomain.com` (Cloudflare for SaaS / Vercel Domains API)
- [ ] **Custom subdomain** — auto-provision `theirorg.yourapp.com` on org creation
- [ ] **Per-tenant branding** — org logo, brand color, app name replace defaults
- [ ] **Custom email domain** — org sends from `noreply@theirdomain.com` via SendGrid/Resend
- [ ] **Remove "Powered by" badge** — white-label tier hides all starter branding
- [ ] **Custom login page** — org-specific login URL with their logo and SSO button

### Integrations & Automation

- [ ] **Zapier integration** — publish Zapier app with triggers and actions
- [ ] **Make (Integromat) integration** — share OpenAPI spec to auto-generate module
- [ ] **Slack app** — slash commands + DM notifications for key events
- [ ] **Native integration marketplace** — `/integrations` page with per-user OAuth flows
- [ ] **HubSpot / Salesforce sync** — push signups and plan changes to CRM
- [ ] **Segment.io or Rudderstack** — server-side analytics pipeline to any downstream tool

### Revenue Recovery & Retention

- [ ] **Dunning management** — retry failed payments on days 3, 7, 14 with escalating emails
- [ ] **Pause subscription** — users pause (not cancel) for up to 3 months
- [ ] **Cancellation flow** — offboarding survey, offer discount or pause as alternatives
- [ ] **Win-back campaign** — automated emails to churned users at 7, 30, 90 days
- [ ] **Usage-based upsell nudges** — "You've used 80% of your storage quota" → upgrade prompt
- [ ] **Lifetime deal (LTD) support** — one-payment plan type with usage cap enforcement

### Enterprise Features

- [ ] **SAML 2.0 SSO** — SP-initiated SSO for Okta, Azure AD, Google Workspace
- [ ] **SCIM provisioning** — auto-create/deactivate users from Azure AD / Okta (RFC 7644)
- [ ] **Custom org roles & permissions** — fine-grained resource permissions defined per org
- [ ] **Audit log export** — CSV download or SIEM stream (Splunk, Datadog, Elastic)
- [ ] **Data residency** — choose storage region (EU / US / APAC) per org
- [ ] **SLA tiers** — 99.9% for Pro, 99.99% for Enterprise; SLA credit automation
- [ ] **Dedicated instance** — single-tenant deployment: own MongoDB, Redis, subdomain
- [ ] **SOC 2 Type II readiness** — access control evidence, change management, incident response checklist
- [ ] **IP allowlist per org** — restrict API + dashboard access to specific CIDR ranges

### Mobile & Offline

- [ ] **React Native / Expo app** — shared auth logic; biometric login via passkeys
- [ ] **Web push notifications** — service worker + Push API
- [ ] **Progressive Web App (PWA)** — `manifest.json`, service worker, "Add to Home Screen"
- [ ] **Offline support** — cache dashboard shell; queue writes offline, sync on reconnect
- [ ] **Deep linking** — invite and magic-link URLs open correctly in web and native app

### AI & Smart Features

- [ ] **AI onboarding assistant** — chat widget guiding new users through setup (Claude / GPT-4o)
- [ ] **Smart search** — Elasticsearch semantic search or OpenAI embeddings
- [ ] **Churn prediction score** — logistic regression on usage signals → at-risk score in admin
- [ ] **Auto-generated reports** — weekly digest email with LLM-written summary of account activity
- [ ] **AI support bot** — trained on help docs; deflects tier-1 support before escalating to human
- [ ] **Usage recommendations** — personalized "try this feature" suggestions based on similar accounts

### Tax, Multi-currency & Global

- [ ] **Stripe Tax** — auto-calculate VAT / GST / sales tax by customer location
- [ ] **Tax exemption certificates** — nonprofits and EU B2B orgs submit VAT ID
- [ ] **Multi-currency pricing** — display prices in local currency; Stripe handles FX
- [ ] **Purchasing Power Parity (PPP)** — automatic regional discounts based on country GDP
- [ ] **EU VAT compliance** — collect and validate EU VAT numbers via VIES; reverse-charge on B2B

### Advanced Search & Discovery

- [ ] **Global command palette** — `Cmd+K` / `Ctrl+K` searching users, settings, docs, recent actions
- [ ] **Elasticsearch full-text search** — already have ES running; index content and surface results
- [ ] **Faceted filters** — filter by type, date, plan, status with instant counts
- [ ] **Search analytics** — log no-result queries → identify gaps in docs/features

### Collaboration & Activity

- [ ] **Team activity feed** — per-org timeline: "Alice invited Bob", "Charlie upgraded to Pro"
- [ ] **@mentions** — `@username` in comments triggers in-app + email notification
- [ ] **Threaded comments** — attach comments to any resource with reply threading
- [ ] **Real-time presence** — show which team members are currently online
- [ ] **Shared notes** — lightweight collaborative notes per org (Tiptap + autosave)

### Data, Import & Export

- [ ] **CSV import** — bulk-create users or records from CSV with column-mapping UI
- [ ] **CSV / JSON export** — every list has an "Export" button; stream large exports
- [ ] **Scheduled exports** — daily/weekly automated export to S3 or email attachment
- [ ] **Bulk operations** — select all → bulk delete, status change, tag assign

### Security & Trust

- [ ] **HaveIBeenPwned check** — check password against HIBP on register/change; warn or block
- [ ] **Dependency vulnerability scanning** — `npm audit` in CI; Dependabot/Renovate PRs
- [ ] **Bug bounty program** — responsible disclosure policy at `/security`
- [ ] **Login notification emails** — email on new device login with "Not you? Revoke" link
- [ ] **Account takeover detection** — flag password reset + email change within short window

### Customer Success

- [ ] **Health score per account** — composite of login frequency, feature depth, team size, payments
- [ ] **At-risk account alerts** — Slack/email to CS team when health score drops below threshold
- [ ] **Automated lifecycle emails** — day 1 welcome, day 3 tip, day 7 check-in, day 14 trial warning
- [ ] **NPS survey automation** — in-app NPS at 30 days, quarterly thereafter; export results to CSV
- [ ] **Customer segments** — tag accounts as "champion", "at-risk", "expansion candidate"
- [ ] **Usage benchmarking** — "You're in the top 20% of teams your size" for engagement
