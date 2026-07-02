# zerotrust — Shipped Features

The authoritative catalog of what zerotrust ships today. Update this file when you
ship a feature. Planned work lives in [`todo.md`](./todo.md); the standing audit
is [`docs/AUDIT.md`](./docs/AUDIT.md).

> **Legend:** ✅ shipped · `[~]` partial / behind a flag

---

## Quick stats

| Metric | Count |
|--------|------:|
| Route modules | 27 |
| Service files | 46 |
| DB tables | 41 |
| Middleware | 21 |
| Migrations | 28 (latest: `0027_webhook_endpoints`) |
| Route mounts in `server.ts` | 30 |
| UI pages | 47 |
| Tests | 835 (99 files) |
| ADRs | 7 |
| Stack | Hono 4 · TypeScript 6 · Bun · Next.js 16 · Drizzle ORM · PostgreSQL · Redis |

---

## Authentication & Identity

- ✅ Email + password with configurable account lockout (threshold + auto-unlock)
- ✅ OAuth — Google, GitHub, Apple, Facebook (admin-toggleable per provider)
- ✅ Magic links (passwordless, 15-minute TTL, email-delivered)
- ✅ Passkeys / WebAuthn FIDO2 — register, authenticate, resident keys, MDS3 attestation policy
- ✅ TOTP (Google Authenticator, Authy, 1Password)
- ✅ Email OTP
- ✅ PASETO v4 access tokens (AES-256-GCM, 1-hour TTL, no JWT footguns)
- ✅ Refresh tokens — SHA-256 hashed, rotated on use, long-lived
- ✅ Session management — list, revoke, device fingerprinting, concurrent-session caps
- ✅ Auth hot path — session+user loaded via one JOIN on cache miss; optional 5 s Redis user-state cache on cache hit
- ✅ Silent token refresh — UI replays 401 via `POST /auth/token/refresh`
- ✅ Account merge / linking — `POST /auth/me/link` adds OAuth providers to existing account
- ✅ HIBP (HaveIBeenPwned) breach check on register / password change (fails open)
- ✅ Login notification email — new-device alert with one-click revoke
- ✅ Account takeover detection — password reset + email change in <1h revokes sessions, alerts both emails
- ✅ Disposable-email blocking — throwaway-domain rejection + optional MX validation

## Access Control & Abuse Defense

- ✅ RBAC + ABAC with just-in-time privilege escalation
- ✅ Continuous access evaluation — re-verification challenges after sensitive operations
- ✅ Anomaly detection — flags unusual login location / time / device
- ✅ Rate limiting — per-IP sliding window, Redis-backed with in-memory fallback
- ✅ Credential-stuffing defense (per-IP) + account lockout (per-account)
- ✅ Optional signup proof-of-work
- ✅ API key rate limiting + quotas — per-key `rateLimitPerMinute`, `monthlyQuota`, 429 + `Retry-After`
- ✅ Scope enforcement per API route — `requireApiKeyScopes()` (`all`/`any` modes)

## Organizations & Teams

- ✅ Workspace model — one org → many members, one user → many orgs
- ✅ Invite by email — time-limited signed links
- ✅ Org roles — owner, admin, member, viewer with permission checks
- ✅ Custom org roles & fine-grained permissions
- ✅ Transfer ownership with confirmation flow
- ✅ Org settings — name, logo, slug, billing contact
- ✅ Per-org IP allowlist — `org_security_policies.ip_allowlist` (CIDRs)
- ✅ Org passkey policy — `requirePasskeyAttestation` / `requireHardwarePasskey` / AAGUID allow/deny lists
- ✅ Session & device policy per org — max session age, idle timeout, concurrent session cap, allowed countries
- ✅ Trusted-device list per org — `trustedDevicesTable` + enforcement middleware
- ✅ Cross-tenant JIT access — request + admin approval inbox + auto-expiring grants

## Billing & Subscriptions

- ✅ Stripe checkout — creates Checkout Session, returns URL
- ✅ Stripe customer portal — manage cards, cancel, download invoices
- ✅ Stripe webhook handler — idempotent (replay-safe via `processed_stripe_events`)
- ✅ Subscription management — plan, status, period dates per user
- ✅ `requirePlan()` middleware — `403 PLAN_REQUIRED` when feature not on plan
- ✅ Plan configs — free / pro / enterprise feature matrix (`src/shared/plans.ts`)
- ✅ Per-org billing — one subscription per organization
- ✅ Trial period — 14-day trial with expiry email + upgrade prompt
- ✅ Upgrade / downgrade flows — Stripe proration
- ✅ Usage counters — API calls metered, seats live-counted
- ✅ Dunning management — D3 / D7 / D14 escalating emails for past_due
- ✅ Cancellation flow — offboarding survey + pause-instead + retention coupon
- ✅ Win-back campaign — D7 / D30 / D90 emails
- ✅ Manual plan override — `PUT /admin/users/:id/plan`
- ✅ Multi-currency pricing — 16 currencies, USD-based FX with fallback table
- ✅ Purchasing Power Parity (PPP) — country-based discount tiers
- ✅ Stripe Tax — location-based tax quotes (27 EU VAT, UK/CH/NO, AU/NZ/CA/SG/IN GST, US sales tax)
- ✅ Tax exemption certificates — verify/reject workflow
- ✅ EU VAT compliance — per-member-state format validation + VIES lookup
- ✅ Broadcast email — `/admin/revenue` composer sends to all or segments

## Wallet

- ✅ Wallet balance — `walletsTable` + `walletTransactionsTable`
- ✅ Top-up via Stripe payment intent
- ✅ Spend with atomic double-spend guard (`UPDATE … WHERE balance >= amount`)
- ✅ Transaction history — `GET /wallet/transactions` (paginated)
- ✅ Auto-top-up config

## API Keys

- ✅ Named keys, SHA-256 hashed (never stored plain), per-user or per-org
- ✅ Key scopes — `read:data`, `write:data`, etc. enforced in middleware
- ✅ `apiKeyAuth` middleware — `Bearer <key>` or `X-API-Key` header
- ✅ Sandbox / test-mode keys — `zak_live_` / `zak_test_` prefix, environment column
- ✅ API key rotation policy — 7-day warning, 90-day max age, email reminders
- ✅ Key creation UI — generate, show plaintext once, copy to clipboard
- ✅ Revoke — instant via `revokedAt`
- ✅ `lastUsedAt` updated on every request

## Email & Notifications

### Email pipeline

- ✅ BullMQ email queue — non-blocking transactional delivery, Redis-backed retry
- ✅ Nodemailer SMTP transport — configurable host / port / credentials
- ✅ Transactional templates — welcome, verify, invite, receipt, magic link, password reset
- ✅ Inline-styled HTML templates with i18n support (en/es/fr)
- ✅ Notification preferences — users choose which emails to receive
- ✅ Unsubscribe tokens — HMAC-SHA256 signed, one-click CAN-SPAM
- ✅ Email suppression list — `email_suppressions` table, skips suppressed recipients
- ✅ Email-event webhook idempotency — replay-safe `POST /webhooks/email/event`
- ✅ Email deliverability hardening — SPF/DKIM/DMARC runbook

### Notification center

- ✅ Per-user notifications with `read` / `unread` state
- ✅ Bell icon + dropdown notification center
- ✅ Real-time delivery — Server-Sent Events (SSE)
- ✅ Granular per-channel per-category preferences
- ✅ Email fallback — deliver via email if user hasn't visited in N days
- ✅ Web push notifications — VAPID, `push_subscriptions` table, per-device opt-in
- ✅ Usage-based upsell nudges — warning ≥80%, exceeded ≥100%
- ✅ Notification adapter plugin pattern — Slack / Teams / PagerDuty adapters (`src/notifications/adapters/`)

## Webhooks (user-facing)

- ✅ Endpoint management — `/dashboard/webhooks` UI + REST CRUD
- ✅ Endpoint persistence — `webhook_endpoints` table + Drizzle-backed store
- ✅ Event catalog — typed `WebhookEventType`
- ✅ Signed payloads — HMAC-SHA256 `X-zerotrust-Signature`
- ✅ Test delivery — ping button sends a signed test event
- ✅ Retry with backoff — automatic on 5xx / timeout
- ✅ Delivery logs — `webhookDeliveryLogs` table, per-attempt history
- ✅ Outbound dispatch idempotency — replay-safe via `processed_webhook_events`

## GDPR, Compliance & Privacy

- ✅ GDPR data export — JSON download of all user data
- ✅ Account deletion — 30-day soft-delete grace period, then full PII purge
- ✅ Data retention — auto-purge audit logs, sessions, OTPs after configurable intervals
- ✅ Legal hold — prevents PII purge for held users
- ✅ Cookie consent banner — GDPR-compliant accept / reject
- ✅ Privacy policy + Terms pages
- ✅ CAN-SPAM unsubscribe — one-click signed tokens
- ✅ Bug-bounty / responsible-disclosure — `/.well-known/security.txt` (RFC 9116)
- ✅ Tamper-evident audit log — SHA-256 hash-chained rows, advisory-locked chain, integrity verification
- ✅ Access reviews — admin snapshots privileged role grants, approve/flag/revoke decisions
- ✅ SOC 2 Type II readiness map — controls mapped to TSC CC6–CC8, A1, C1/P
- ✅ Risk assessment — annual risk register with likelihood × impact scoring
- ✅ Privacy records — ROPA, consent receipts, DPA, SAR generators
- ✅ SSF (Shared Signals Framework) event receiver — idempotent

## Observability

- ✅ Prometheus metrics — `/metrics` endpoint (prom-client, app registry)
- ✅ OpenTelemetry tracing — `NodeSDK` with OTLP exporter, `withSpan()` helper
- ✅ Sentry — server + browser error capture
- ✅ Structured logging — `getLogger()` with levels + correlation IDs
- ✅ Trace correlation test — login flow asserts `X-Trace-Id` response propagation and structured request log correlation
- ✅ Audit log fan-out — Elasticsearch + SIEM (Datadog/Splunk/S3)
- ✅ Health status page — public `/status` with per-component state
- ✅ Alerting — Slack / Teams / PagerDuty on error spike or latency breach
- ✅ Kibana dashboards — pre-built 8.x dashboards
- ✅ Distributed tracing viewer — `docker-compose.tracing.yml` (Jaeger)
- ✅ SLO burn-rate reporting — error budget + burn rate from Prometheus metrics
- ✅ Read replica support — `DATABASE_URL_READ_REPLICA`, `getReadDb()`
- ✅ Load + chaos harness — k6 full-suite + chaos-fault scenarios

## Security & Cryptography

- ✅ PASETO v4 — AES-256-GCM
- ✅ CSFLE field encryption — `CSFLEManager`, key versioning, encrypt/decrypt plugin
- ✅ Security headers — Hono `secureHeaders` on every route
- ✅ Global input sanitization — strips dangerous HTML, neutralizes XSS payloads
- ✅ CORS — configurable allowlist, fails closed in production
- ✅ API versioning — `X-API-Version` header / `/vN` prefix, deprecation/sunset headers
- ✅ CWE hardening — CWE-601 (safe redirects), CWE-918 (SSRF guards), CWE-78 (no shell injection), CWE-22 (safe upload keys), CWE-532 (no secrets in logs), CWE-1333 (ReDoS), CWE-327 (SHA-256+/AES-256-GCM), CWE-1427 (LDAP/identifier escaping)
- ✅ Agent-aware audit log — `AuditPrincipal` (human/agent) derived from token
- ✅ `[~]` Post-quantum crypto — hybrid KEM provider (not yet productized)

## User Dashboard

- ✅ Profile — display name, avatar, language preference
- ✅ Security — password change, MFA (TOTP + passkeys), active sessions
- ✅ Sessions — list active sessions with device info, revoke any
- ✅ Account — GDPR data export, account deletion
- ✅ Settings — notification preferences
- ✅ Organizations — list, create, view members
- ✅ API Keys — create, list (prefix only), revoke
- ✅ Billing — plan cards, upgrade, manage subscription
- ✅ Wallet — balance, transactions
- ✅ Support — self-hosted threaded tickets, create + list + thread + reply
- ✅ Search — global search page
- ✅ Notifications — notification center with preferences
- ✅ App shell — responsive with collapsible sidebar, sticky topbar, mobile drawer

## Admin Panel

- ✅ Stats dashboard — user count, active sessions, recent registrations
- ✅ User management — list, search, view detail, edit roles, force logout, delete, impersonate
- ✅ Session browser — paginated all-session browser with total counts and revoke-any controls
- ✅ Audit log viewer — searchable immutable event trail with integrity verification
- ✅ Auth settings — toggle every auth method on/off live
- ✅ General settings — app name, URL, branding
- ✅ Revenue metrics — MRR, ARR, churn, past-due, trial counts
- ✅ Feature flag management — CRUD with global toggle, per-user force, % rollout
- ✅ CSV exports — users and audit logs
- ✅ Cross-tenant JIT admin — approve / deny / history
- ✅ Access reviews — list/detail with approve/flag/revoke
- ✅ Legal hold — place/lift (audited)
- ✅ Customer segments — champion, at_risk, expansion, new
- ✅ SLO dashboard — error budgets, burn rates

## Frontend (Next.js 16)

- ✅ Landing page, user dashboard, guarded admin panel — single app
- ✅ PWA — installable, offline app-shell, web push, deep linking
- ✅ i18n — next-intl (en/es/fr/ar with RTL support), locale-aware `Intl.*` formatting
- ✅ Dark mode — system preference + manual override
- ✅ Toast notifications, loading skeletons, empty states
- ✅ Mobile-responsive — all pages usable on phone
- ✅ Command palette — `Cmd/Ctrl-K` page navigator
- ✅ Setup checklist — dismissable onboarding checklist
- ✅ Product tour — first-login spotlight walkthrough
- ✅ Live chat widget — Crisp / Intercom / Tawk.to + native fallback
- ✅ Help center — searchable FAQ with category filter
- ✅ In-app NPS / feedback widget
- ✅ Cookie consent banner with consent-gated analytics (Plausible, GA4)
- ✅ Sitemap.xml + robots.txt — generated at build time
- ✅ Protected routes — client guards on `/dashboard` + `/admin`

## Platform & Infrastructure

- ✅ Generated TypeScript SDK — `@zerotrust/client` from `openapi.json` (115 operations)
- ✅ Elasticsearch provider dependency — `@elastic/elasticsearch` is explicit in root deps for search-provider enablement
- ✅ S3-compatible storage — provider-agnostic (AWS S3, B2, R2, MinIO, Wasabi)
- ✅ DB backups — `pg_dump` with local + S3 retention, AES-256-GCM encryption
- ✅ DB restore + PITR — `bun run db:restore`, Neon PITR runbook
- ✅ CDN / edge delivery for uploads — `UPLOADS_CDN_URL`
- ✅ Pre-signed upload URLs — direct-to-storage via S3 PUT
- ✅ File attachments — `fileAttachmentsTable`, admin upload + listing
- ✅ Repository layer — 4 transactional repos (authSessions, stripeEvents, wallet, pointsLedger)
- ✅ Background jobs — registry with Zod schemas, Redis-lock leader election, dedicated worker (`src/worker.ts`)
- ✅ Module boundaries — `.boundaries.json` + `scripts/check-boundaries.ts`, CI-enforced
- ✅ Shared canonical modules — pagination, safeFetch, safeRedirect, cryptoHash, httpErrors, apiClient
- ✅ CI/CD — GitHub Actions (lint, type-check, test, SDK drift, UI build, SAST, E2E, load)
- ✅ Docker Compose — full dev stack + observability overlay
- ✅ Dockerfile — multi-stage production image (Bun + Node)
- ✅ 7 ADRs — PASETO v4, modular monolith, Drizzle, Redis/BullMQ, generated SDK, token rotation, module boundaries
- ✅ Deployment blueprints — VM/PM2, containers, Kubernetes (`docs/reference-architecture.md`)

---

## Recent work (2026-07-02)

- **Audit-report must-fix sweep:** Resolved/verified the fork-blocking items in
  `AUDIT-REPORT.md`: UI production build passes; LF normalization is enforced by
  `.gitattributes`; no-floating-promise hazards are fixed in touched UI code;
  reset-password uses the OTP `/auth/password-reset/confirm` flow; stale
  `/admin/users/invite`, `/auth/logout/all`, and `/admin/users/:id/logout` route
  drift is gone; `verify`, `fetchOrgs`, `fetchSessions`, and `showToast` are
  stable hook dependencies; input sanitization is mounted before routes; admin
  broadcast email fan-out routes through BullMQ.

- **Webhook endpoint persistence:** Replaced the user-facing webhook endpoint
  in-memory store with Drizzle persistence via `webhook_endpoints`, added
  migration `0027_webhook_endpoints`, and added persistence regression coverage.
  Delivery and management routes now await the async store.

- **Audit follow-up C2/B9:** Added `@elastic/elasticsearch` as an explicit root
  dependency so the Elasticsearch provider no longer silently lacks its runtime
  package, and added page/limit controls plus regression coverage for the admin
  all-sessions browser.

- **Verification:** `bun run test -- --run` → **835 tests / 99 files passing**;
  `bun run build`, `bun run lint`, `bun run --cwd packages/ui build`,
  `bun run boundaries:check`, and `bun run type-check` all pass. UI vitest passes
  **46 tests / 9 files**. Generated SDK/docs regenerate deterministically; this
  batch intentionally updates the API↔UI integration matrix and shadcn adoption
  report. UI build reports only the existing Next/SWC version warning
  (`@next/swc` 16.2.9 vs Next 16.2.7).

## Recent work (2026-07-01)

- **D6 — Backlog sweep from `todo.md`:** Expanded `openapi.json` and generated
  docs/SDK from 57 to **115 operations** across 20 tag groups; added SDK README
  usage examples; migrated the top shadcn/raw-control targets (audit now **44
  raw controls across 22 files**); added login-path trace correlation coverage;
  optimized `authMiddleware` with a one-query session+user JOIN on cache miss;
  added a 5 s Redis user-state cache with explicit invalidation on profile,
  email/avatar, admin user, and role changes; added k6 scripts for login storm
  and auth-cache p95 thresholds. Verification: `bun run test` → **832 tests / 97
  files passing**; `bun run build`, `bun run sdk:build`, `bun run docs:api`, and
  `bun run ui:audit` all pass. Local `bun run lint` is still blocked by broad
  pre-existing repo formatting/no-floating-promise diagnostics outside this
  change set; touched files passed targeted Biome checks.

- **Admin audit logs empty-state fix:** Removed the admin audit page's
  illustrative sample-data fallback (`alice@acme.com`, `bob@acme.com`, etc.).
  Empty `/admin/audit-logs` responses now render the real empty state instead of
  fake rows; API load failures render an explicit error banner plus the empty
  table state. Added `auditEntriesFromResponse` regression coverage.

- **M1 — `as any` reduction (213 → 3):** Four passes across all security-critical
  files. Three real bugs found and fixed along the way: `.rowCount`→`.count`
  mismatch in dataRetention/emailSuppression/sessionControl (silent zero-count
  reporting), and lifecycleEmail metadata-wipe (all four lifecycle queries
  overwrote the entire `metadata` column). Both remaining `as any` are documented
  legitimate exceptions (Stripe API version string, false-positive prose comment).

- **M2 — Notification adapter pattern:** Extracted Slack/Teams/PagerDuty into
  standalone adapter modules behind a `NotificationAdapter` capability interface.
  Adding a new provider is now "write one module + register it." Isolated adapter
  + dispatcher tests added.

- **H3 — UI component/integration tests:** happy-dom + Testing Library harness.
  Grew from 11 to 58 tests across 8 files (login, register, reset-password,
  forgot-password, org management, billing, admin users).

- **MFA/WebAuthn route test coverage:** 53 route-level tests for the three
  previously-untested security-critical route files (`mfa.routes.test.ts` 17,
  `passkey.routes.test.ts` 18, `verification.routes.test.ts` 18). Exercises real
  Hono handlers with mocked DB / settings / `@simplewebauthn/server` / `otpauth`.
  Full suite: **826 tests (94 files)**. Build green.

- **Pagination standardization:** Shared `parsePaginatedQuery()` + `paginated()`
  envelope across 15+ list endpoints.

- **CWE security hardening sweep:** CWE-601, 918, 78, 22, 532, 1333, 327, 1427
  all mitigated with centralized canonical modules.
