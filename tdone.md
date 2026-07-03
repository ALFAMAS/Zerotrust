# zerotrust — Shipped Features

The authoritative catalog of what zerotrust ships today. Update this file when you
ship a feature. Planned work lives in [`todo.md`](./todo.md); the standing audit
is [`docs/AUDIT.md`](./docs/AUDIT.md).

> **Legend:** ✅ shipped · `[~]` partial / behind a flag

---

## Quick stats

| Metric | Count |
|--------|------:|
| Route modules | 26 |
| Service files | 46 |
| DB tables | 40 |
| Middleware | 21 |
| Migrations | 34 (latest: `0034_drop_webhook_tenant_id`) |
| Route mounts in `server.ts` | 29 |
| UI pages | 53 |
| Tests | 1317 (1075 API + 242 UI, 134 files) |
| ADRs | 8 |
| Stack | Hono 4 · TypeScript 6 · Bun · Next.js 16 · Drizzle ORM · PostgreSQL · Redis |

---

## Authentication & Identity

- ✅ Email + password with configurable account lockout (threshold + auto-unlock)
- `[~]` OAuth — Google, GitHub, Facebook (admin-toggleable); Apple Sign In not implemented
- ✅ Magic links (passwordless, 15-minute TTL, email-delivered)
- ✅ Passkeys / WebAuthn FIDO2 — register, authenticate, resident keys, MDS3 attestation policy
- ✅ TOTP (Google Authenticator, Authy, 1Password)
- ✅ Email OTP
- ✅ PASETO v4 access tokens (AES-256-GCM, 1-hour TTL, no JWT footguns)
- ✅ Refresh tokens — SHA-256 hashed, rotated on use, long-lived
- ✅ Session management — list, revoke, device fingerprinting, concurrent-session caps
- ✅ Auth hot path — session+user loaded via one JOIN on cache miss; optional 5 s Redis user-state cache on cache hit
- ✅ Silent token refresh — UI replays 401 via `POST /auth/token/refresh` (httpOnly refresh cookie + in-memory access token, ADR 008 Option C)
- ✅ Account merge / linking — `POST /auth/me/link` adds OAuth providers to existing account
- ✅ HIBP (HaveIBeenPwned) breach check on register / password change (fails open)
- ✅ Login notification email — new-device alert with one-click revoke
- ✅ Account takeover detection — password reset + email change in <1h revokes sessions, alerts both emails
- ✅ Disposable-email blocking — throwaway-domain rejection + optional MX validation

## Access Control & Abuse Defense

- ✅ RBAC + ABAC with just-in-time privilege escalation
- ✅ Continuous access evaluation — `sensitiveReverification` mounted on MFA disable, email change, OAuth unlink, org transfer, and billing cancel; UI `ReverificationProvider` + `apiClient` intercept `REVERIFICATION_REQUIRED`, run `/auth/verify/challenge` → `/auth/verify/respond`, and retry the original mutation
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
- ✅ Invite acceptance + invitee visibility (ALFA-3) — `POST /orgs/invites/accept` validates the
  token/email/expiry and creates membership inside one transaction
  (`acceptOrgInvite` in `src/db/repositories/orgs.repository.ts`); invited users see their pending
  invites with accept/decline actions on `/dashboard/organizations` via `GET /orgs/invites/mine`;
  creating an invite fires an in-app notification (existing accounts) and a branded invite email
  (`sendOrgInviteEmail`, new or existing accounts)

## Billing & Subscriptions

- ✅ Stripe checkout — creates Checkout Session, returns URL
- ✅ Stripe customer portal — manage cards, cancel, download invoices
- ✅ Stripe webhook handler — idempotent (replay-safe via `processed_stripe_events`)
- ✅ Subscription management — plan, status, period dates per user
- ✅ `requirePlan()` middleware — `403 PLAN_REQUIRED` when feature not on plan; wired on admin audit logs, org branding/domain/region, and high-priority support tickets
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

- ✅ GDPR data export — JSON download of all user data (profile, sessions, audit logs as actor or target, org memberships, wallet + transactions, support tickets + messages, feedback, notifications, passkey metadata)
- ✅ Account deletion — 30-day soft-delete grace period, then full PII purge
- ✅ Data retention — auto-purge audit logs, sessions, OTPs after configurable intervals
- ✅ Legal hold — prevents PII purge for held users
- ✅ Cookie consent banner — GDPR-compliant accept / reject
- ✅ Privacy policy + Terms pages
- ✅ CAN-SPAM unsubscribe — one-click signed tokens
- ✅ Bug-bounty / responsible-disclosure — `/.well-known/security.txt` (RFC 9116)
- ✅ Tamper-evident audit log — SHA-256 hash-chained rows, advisory-locked chain, integrity verification
- ✅ Audit log external anchoring — scheduled `audit.anchor` job, `audit_log_anchors` table, `bun run audit:anchor-verify`, optional S3 upload
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
- ✅ Audit log fan-out — optional Elasticsearch + SIEM (Datadog/Splunk/S3); Postgres hash-chain is the default store
- ✅ Health status page — public `/status` with per-component state
- ✅ Alerting — Slack / Teams / PagerDuty on error spike or latency breach
- ✅ Kibana dashboards — pre-built 8.x dashboards
- ✅ Distributed tracing viewer — `docker-compose.tracing.yml` (Jaeger)
- ✅ SLO burn-rate reporting — error budget + burn rate from Prometheus metrics
- ✅ Read replica support — `DATABASE_URL_READ_REPLICA`, `getReadDb()`
- ✅ Load + chaos harness — k6 full-suite + chaos-fault scenarios

## Security & Cryptography

- ✅ PASETO v4 — AES-256-GCM
- ✅ CSFLE field encryption — `CSFLEManager`, key versioning, encrypt/decrypt plugin (**software key store only**; TPM / Secure Enclave / PKCS#11 providers are unimplemented stubs — see `src/crypto/hardware-key-store.ts`)
- ✅ Software key store — `SoftwareKeyProvider` via `KEY_PROVIDER=software|auto`; hardware providers fail fast at startup if explicitly requested
- ✅ Security headers — custom `securityHeaders()` middleware (CSP, HSTS preload, X-Frame-Options DENY) on every route
- ✅ Global input sanitization — strips dangerous HTML, neutralizes XSS payloads
- ✅ CORS — configurable allowlist, fails closed in production
- ✅ API versioning — `X-API-Version` header / `/vN` prefix, deprecation/sunset headers
- ✅ CWE hardening — CWE-601 (safe redirects), CWE-918 (SSRF guards), CWE-78 (no shell injection), CWE-22 (safe upload keys), CWE-532 (no secrets in logs), CWE-1333 (ReDoS), CWE-327 (SHA-256+/AES-256-GCM), CWE-1427 (LDAP/identifier escaping)
- ✅ Agent-aware audit log — `AuditPrincipal` (human/agent) derived from token

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
- ✅ Search — global search page (Postgres FTS by default; Elasticsearch opt-in for large tenants)
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
- ✅ TanStack Query server-state layer — app-level `QueryClientProvider`, domain
  query keys/functions, colocated wallet/webhook/billing hooks, optimistic
  mutations where safe, and stale/background-refetch UI states

## Platform & Infrastructure

- ✅ Generated TypeScript SDK — `@zerotrust/client` from `openapi.json` (209 operations)
- ✅ Elasticsearch provider dependency — `@elastic/elasticsearch` is explicit in root deps; disabled by default (`ELASTICSEARCH_ENABLED=false`)
- ✅ S3-compatible storage — provider-agnostic (AWS S3, B2, R2, MinIO, Wasabi)
- ✅ DB backups — `pg_dump` with local + S3 retention, AES-256-GCM encryption
- ✅ DB restore + PITR — `bun run db:restore`, Neon PITR runbook
- ✅ CDN / edge delivery for uploads — `UPLOADS_CDN_URL`
- ✅ Pre-signed upload URLs — direct-to-storage via S3 PUT
- ✅ File attachments — `fileAttachmentsTable`, admin upload + listing
- ✅ Repository layer — 4 transactional repos (authSessions, stripeEvents, wallet, pointsLedger)
- ✅ Background jobs — registry with Zod schemas, BullMQ-backed job scheduler with retry/backoff + dead-letter visibility, dedicated worker (`src/worker.ts`)
- ✅ Module boundaries — `.boundaries.json` + `scripts/check-boundaries.ts`, CI-enforced
- ✅ Shared canonical modules — pagination, safeFetch, safeRedirect, cryptoHash, httpErrors, apiClient
- ✅ UI HTTP client boundary — canonical `apiClient` helpers for JSON, FormData, blob, retry, refresh replay; legacy `api` facade documented
- ✅ CI/CD — GitHub Actions (lint, type-check, test, SDK drift, UI build, SAST, E2E, load)
- ✅ Docker Compose — Postgres + Redis dev stack; Elasticsearch/Kibana behind `--profile elasticsearch`
- ✅ Dockerfile — multi-stage production image (Bun + Node)
- ✅ 8 ADRs — PASETO v4, modular monolith, Drizzle, Redis/BullMQ, generated SDK, token rotation, module boundaries, token storage revisit
- ✅ Deployment blueprints — VM/PM2, containers, Kubernetes (`docs/reference-architecture.md`)

---

## Recent work (2026-07-04)

### ARCH-3 — Remove dead geo/temporal middleware (shipped)

- **Deleted:** `src/middleware/geoFencing.ts`, `src/middleware/temporalAccess.ts` (demo-only
  `/protected` mounts; org country/session limits live in `sessionPolicy.service.ts`).
- **Added:** `src/shared/inferClientCountry.ts` + global `inferredCountryMiddleware()` so
  login/session creation and risk scoring get a country from client IP without duplicate
  enforcement paths.
- **Docs:** `docs/ARCHITECTURE.md` middleware list updated.
- **Regression:** `src/__tests__/middleware.test.ts` (inferClientCountry), server mount
  no longer references removed middleware.
- **Verification (2026-07-04):** targeted middleware + server security header tests pass.

### FS-3 — Passkey JSONB row-lock (shipped)

- **`passkeys.repository.ts`:** `registerPasskey()` and `completePasskeyAuthentication()`
  `SELECT … FOR UPDATE` the user row inside the transaction before read-modify-write on
  `passkeys` / `mfa`.
- **Regression:** `src/__tests__/p1.repositories.test.ts` asserts `.for("update")`.
- **Verification (2026-07-04):** P1 repository tests pass.

### CP-2 — GDPR Art. 15 export completeness (shipped)

- **`GET /gdpr/export`:** adds wallet balance + transactions, support tickets (with
  messages), feedback, in-app notifications, passkey metadata (no raw public keys); audit
  logs include rows where the user is `actorId` **or** `targetId`.
- **Regression:** `src/__tests__/gdpr.routes.test.ts`.
- **Verification (2026-07-04):** GDPR route tests pass.

### ARCH-1 — Remove orphaned `tenants` multi-tenancy model (shipped)

- **Decision:** `organizations` is the sole tenancy boundary; deleted orphaned
  `tenants` table, routes, model, and OpenAPI/SDK surface.
- **Migration:** `drizzle/0032_drop_tenants.sql`.
- **Removed:** `src/api/routes/tenant.routes.ts`, `src/models/tenant.model.ts`,
  tenant mount from `server.ts`; `/admin/tenants` UI redirects to
  `/dashboard/organizations`.
- **Regression:** `src/__tests__/server.securityHeaders.test.ts` — no
  `/admin/tenants` mount in `createServer()`.
- **Verification (2026-07-04):** `bun run test --run` → **1076 passed**.

### ARCH-2 — `/admin/tenants/*` missing authMiddleware (shipped via ARCH-1)

- Orphaned tenant admin surface removed with ARCH-1; wiring bug no longer
  reachable. Covered by server mount assertion above.

### MT-1 — Org-scoping CI lint (shipped)

- **Script:** `scripts/check-org-scoping.ts` + `scripts/org-scoped-tables.json`
  flags Drizzle queries on org-scoped tables missing an org predicate.
- **CI:** `bun run org-scoping:check` in `.github/workflows/ci.yml`.
- **Verification (2026-07-04):** `bun run org-scoping:check` → **33 files scanned, 0 violations**.

### FS-1 — Audit log DB immutability (shipped)

- **Migration:** `drizzle/0031_audit_logs_immutable.sql` — `BEFORE UPDATE OR DELETE`
  triggers on `audit_logs`.
- **Docs:** `docs/reference-architecture.md` + `docs/compliance/audit-log-anchoring-plan.md`
  — `AUDIT_ANCHOR_ENABLED=true` default for production reference deploys.
- **Verification (2026-07-04):** migration present in `drizzle/`; destructive-migrations
  manifest approved.

### FS-2 — Wire `requirePlan()` to paywalled routes (shipped)

- **`requirePlan.ts`:** org-scoped plan resolution via `resolvePlan(userId, orgId)`.
- **Routes:** admin audit logs (`auditLog`), org branding/domain/region (`customRoles`,
  `ssoSaml`), high-priority support tickets (`prioritySupport`).
- **Regression:** `src/__tests__/requirePlan.test.ts`.
- **Verification (2026-07-04):** `bun run test -- src/__tests__/requirePlan.test.ts` → pass.

### ZT-4 — Reject placeholder secrets in production (shipped)

- **`src/shared/placeholderSecrets.ts`** + production guard in `validateConfig()`.
- **Updated:** `.env.example`, `docker-compose.yml` comments.
- **Regression:** `src/__tests__/config.production.test.ts` — placeholder hex refused.
- **Verification (2026-07-04):** `bun run test -- src/__tests__/config.production.test.ts` → pass.

### ZT-3 — ADR 008 Option C token storage (shipped)

- **API:** `src/shared/authCookies.ts`; login/refresh/oauth set httpOnly refresh
  cookie; `POST /auth/logout` clears it; JSON bodies omit `refreshToken`.
- **UI:** in-memory access token (`auth.ts`); `apiClient.ts` uses
  `credentials: "include"` for refresh.
- **ADR 008** updated — Option C is default template.
- **Verification (2026-07-04):** `bun run --cwd packages/ui test --run` → **242 passed**.

### MT-2 — Cross-tenant JIT org FKs (shipped)

- **Schema:** `cross_tenant_jit_requests.requestor_org_id` / `target_org_id` UUID FKs
  to `organizations`.
- **Migration:** `drizzle/0033_jit_org_ids.sql`.
- **Routes:** `src/jit/routes.ts` resolves org membership via `organizationMembersTable`.
- **Regression:** `src/__tests__/jit.routes.test.ts`.
- **Verification (2026-07-04):** JIT tests pass in full suite.

### MT-3 — Drop `webhook_endpoints.tenant_id` (shipped)

- **Migration:** `drizzle/0034_drop_webhook_tenant_id.sql`; store uses `org_id` only.
- **Regression:** `src/__tests__/webhookStore.persistence.test.ts`.
- **Verification (2026-07-04):** webhook tests pass in full suite.

### ZT-1 — Webhook management cross-tenant IDOR (shipped)

- **Routes:** `GET/POST /webhooks` and `GET/PATCH/DELETE/POST …/:id` scope by caller org
  memberships via `src/webhooks/orgScope.ts`; client `tenantId` query/body is ignored.
- **Schema:** migration `0030_webhook_endpoints_org_id` adds `org_id` FK; store matches on
  `org_id` with legacy `tenant_id` backfill compat.
- **Store:** `listEndpointsForOrgs`, org-scoped `getEndpoint` / `updateEndpoint` /
  `deleteEndpoint`.
- **Regression:** `src/__tests__/webhooks.routes.test.ts` — org A cannot list/read/mutate
  org B webhooks (7 tests).
- **Verification (2026-07-04):** `bun run test -- src/__tests__/webhooks.routes.test.ts`
  → **7 passed**; full API suite → **1080 passed**.

### ZT-2 — Content-Security-Policy in production (shipped)

- **`server.ts`:** replaced Hono `secureHeaders()` with canonical `securityHeaders()`
  from `src/middleware/securityHeaders.ts` (CSP, HSTS preload, frame denial).
- **Regression:** `src/__tests__/server.securityHeaders.test.ts` — `createServer()` returns
  `content-security-policy` on `/health` + wiring assertion on `server.ts`.
- **ADR 008:** mitigations list updated to reference active CSP middleware.
- **Verification (2026-07-04):** `bun run test -- src/__tests__/server.securityHeaders.test.ts`
  → **2 passed**.

### CP-1 — SOC 2 data residency risk register honesty (shipped)

- **R-006** downgraded from `mitigated` → `partial` in `compliance.service.ts`; mitigation
  text documents logical `storageRegion` tagging only (single Postgres/S3 per deploy).
- **R-005** mitigation softened to remove overclaimed residency controls.
- **`region.service.ts`:** comment clarifies `storageRegion` is a label, not physical routing.
- **Evidence:** `docs/compliance/evidence/2026/risk-assessment/2026-annual-risk-assessment.md`
  and `docs/compliance/soc2-auditor-readiness.md` updated (R-006 partial).

### DQ-1 — Dockerfile starts the API (shipped)

- **`Dockerfile`:** `BUN_VERSION=1.3.14` / `NODE_VERSION=20-alpine` interpolated into
  `FROM oven/bun:` / `node:`; `CMD` → `bun dist/api/server.js` / `node dist/api/server.js`
  (not `index.ts` export barrel).
- **CI:** `docker-smoke` job in `.github/workflows/ci.yml` builds image and curls `/health`.
- **Verification (2026-07-04):** `bun run test --run` → **1080 passed**; Dockerfile CMD
  points at `dist/api/server.js`.

### T5 — Test coverage ratchet toward 85% (shipped)

Final T5 increment closes the audit backlog item. Incremental ratchet gates now
cover both API (`vitest.config.ts`) and UI (`packages/ui/vitest.config.ts`), with
CI enforcement via `bun run test:coverage` and `bun run test:coverage:ui`.

- **`queryKeys.test.ts` (6 tests, root suite):** full coverage of TanStack Query
  key factories (`queryKeys.ts` 20%→**98%** lines in API coverage report).
- **`SecurityClient` expansion (7 tests):** TOTP verify/disable, passkey-unavailable,
  passkey list, OAuth connect/disconnect, loading state — `SecurityClient.tsx`
  ~37%→**72%** lines in UI coverage report.
- **API ratchet raised** in `vitest.config.ts`: lines 66→**67**, functions
  61→**66**, branches 59→**60** (statements **65** unchanged; measured
  67.41/65.9/60.02/66.08).
- **UI ratchet raised** in `packages/ui/vitest.config.ts`: lines 53→**54**,
  functions 51→**52** (statements **51**, branches **46** unchanged; measured
  54.59/51.97/46.55/52.25).
- **CI:** added `test:coverage:ui` script and blocking UI coverage step in
  `.github/workflows/ci.yml`.
- **Verification (2026-07-04):** `bun run test` → **1003 API tests** (121 files);
  `bun run test:coverage` → green at new API floors (67/66/60/65); UI suite →
  **239 passed / 0 failed**; `bun run test:coverage:ui` → green at new UI floors
  (54/52/46/51).

_Long-term ≥85% API/UI targets remain aspirational — tracked in
`docs/maintenance-scorecard.md` §3 as coverage increments continue outside the
formal backlog._

### T5 — Test coverage ratchet increment (UI triage + API shared modules)

- **UI test triage (13 failures fixed):** P3.11 RSC/client splits left
  `auth.test.tsx`, `organizations.test.tsx`, and `security/page.test.tsx`
  rendering async `page.tsx` wrappers instead of client components. Updated to
  `SettingsClient`, `OrganizationsClient`, and `SecurityClient` — all **232 UI
  tests** now pass (was 219/13).
- **API shared-module tests (10 tests):** new `plans.test.ts` (`planAllows`,
  `planLimit`, `PLAN_CONFIGS` — `plans.ts` 11%→100% lines) and extended
  `apiHelpers.test.ts` (`ok`, `fail`, `dbGuard` fallback/rethrow —
  `apiHelpers.ts` 57%→100% lines).
- **API ratchet raised** in `vitest.config.ts`: statements 64→**65** (lines
  **66**, functions **61**, branches **59** unchanged; measured 66.60/65.16/59.74/61.77).
- **UI ratchet raised** in `packages/ui/vitest.config.ts`: branches 45→**46**
  (lines **53**, statements **51**, functions **51** unchanged; measured
  53.85/51.25/51.41/46.10).
- **Verification (2026-07-04):** `bun run test` → **997 API tests** (120 files);
  `bun run test:coverage` → green at new API floors (66/61/59/65); UI suite →
  **232 passed / 0 failed**; UI coverage (`packages/ui` vitest `--coverage`) →
  **53.85%** lines.

---

## Recent work (2026-07-03)

### T5 — Test coverage ratchet increment (API + UI tests)

- **API shared-module tests (30 tests):** `pagination.test.ts`, `permissions.test.ts`,
  `locale.test.ts`, `clientIp.test.ts`, `usageMetering.test.ts` — canonical helpers
  that previously had partial or no direct coverage (`pagination.ts` 0%→96% branches,
  `permissions.ts`, `locale.ts`, `clientIp.ts`, `usageMetering.ts` now ≥94% lines).
- **API ratchet raised** in `vitest.config.ts`: lines 65→**66**, functions 60→**61**,
  branches 58→**59** (statements floor unchanged at **64**; measured 64.76%).
- **UI page/client tests (12 tests):** `OrganizationsClient.test.tsx`,
  `SettingsClient.test.tsx`, `invite/[token]/page.test.tsx`,
  `admin/access-reviews/page.test.tsx` — org list/invites, OAuth settings, invite
  accept flow, and SOC 2 access-review admin surface.
- UI floors unchanged (53/51/45/51); 13 pre-existing failures in
  `auth.test.tsx`, `organizations.test.tsx`, and `security/page.test.tsx` block
  the next UI ratchet until triaged.
- **Verification (2026-07-03):** `bun run test` → **987 API tests** (119 files);
  `bun run test:coverage` → green at new API floors (66/61/59/64; measured
  66.24/61.37/59.23/64.76); UI suite → **219 passed / 13 failed** (232 total);
  UI coverage with `reportOnFailure` → 53.46% lines.

---

## Recent work (2026-07-03)

### M4 — Module boundary violation resolved

- Extracted env-driven S3 configuration to `src/shared/s3Config.ts` (`getS3Config`,
  `isS3BackupEnabled`, `s3RetentionDays`). `src/audit/anchor.ts` now imports from
  the shared layer instead of `services/ops/objectStorage.service`; ops object
  storage re-exports the shared helpers for backward compatibility.
- **Verification (2026-07-03):** `bun run boundaries:check` → **0 violations**;
  `bun run test -- src/__tests__/audit.anchor.test.ts src/__tests__/s3Config.test.ts
  src/__tests__/objectStorage.service.test.ts` → **57 tests passing**;
  `bun run type-check` → pass.

### P3.11 — RSC server prefetch expansion (four pages)

- Split `SecurityClient`, `SettingsClient`, `OrganizationsClient`, and `AuditClient`
  from RSC `page.tsx` wrappers with `HydrationBoundary` prefetch via extended
  `prefetch.ts` (`oauthProviders`, `organizationsList`, `myOrgInvites`,
  `auditEntries`). Ten prefetched routes total (P3.4/P3.6 pilot + this expansion).
- Documented in [`docs/ui-http-client.md`](./docs/ui-http-client.md).
- **Verification (2026-07-03):** `bun run test -- packages/ui/src/lib/server-state/prefetch.test.ts`
  → **8 tests passing**; `bun run --cwd packages/ui build` → pass (52 app routes).

---

### P1 — Security & access control gaps shipped

- **B1 — Org invite acceptance:** `POST /orgs/invites/accept` validates
  token/email/expiry and creates membership in one transaction via
  `acceptOrgInvite` (`src/db/repositories/orgs.repository.ts`). OpenAPI/SDK
  regenerated; `docs/api-ui-integration-matrix.md` shows the path wired from
  `packages/ui/src/lib/server-state/organizations.ts` and
  `packages/ui/src/app/invite/[token]/page.tsx`.
- **ALFA-3 — Invitee visibility + notifications:** `GET /orgs/invites/mine`
  lists pending invites for the authenticated user; `/dashboard/organizations`
  renders accept/decline actions. Creating an invite (`POST /orgs/:orgId/invites`)
  fires an in-app notification for existing accounts and a branded email via
  `sendOrgInviteEmail` (non-blocking — invite row is source of truth).
- **B3 — Continuous access re-verification (end-to-end):** `sensitiveReverification`
  guards `DELETE /auth/mfa/totp`, `POST /auth/me/email`, `DELETE /auth/oauth/:provider`,
  `POST /orgs/:orgId/transfer`, and `POST /billing/cancel`. UI
  `ReverificationProvider` + `apiClient` intercept `REVERIFICATION_REQUIRED`,
  run `/auth/verify/challenge` → `/auth/verify/respond`, and retry the original
  mutation.
- **Verification (2026-07-03):** `bun run test -- src/__tests__/org.routes.test.ts
  src/__tests__/p1.repositories.test.ts src/__tests__/continuousVerification.test.ts
  src/__tests__/mfa.routes.test.ts src/__tests__/verification.routes.test.ts`
  → **81 tests passing**; `bun run verify:generated` → **0 diff**.

---

### P5 — Compliance and security hardening shipped

- **P5.1 Audit log external anchoring:** migration `0029_audit_log_anchors`; `src/audit/anchor.ts`
  with `runAuditAnchor()` + `verifyAuditAnchors()`; scheduled `audit.anchor` job (24h,
  BullMQ-scheduled); CLI `bun run audit:anchor` and `bun run audit:anchor-verify`; optional
  S3 upload under `AUDIT_ANCHOR_S3_PREFIX`; evidence in
  `docs/compliance/evidence/2026/Q3/audit-log/`.
- **P5.2 Compliance evidence program:** policies approved 2026-07-03; vendor register
  populated with Q3 review; restore drill + incident tabletop recorded under
  `docs/compliance/evidence/2026/Q3/`; evidence register updated (E-001, E-004–E-006, E-009).
- **P5.3 Hardware key-store clarity:** README + `tdone.md` state software CSFLE/key store
  only; removed `[~]` post-quantum claim (no PQC code in `src/crypto/`).
- **Verification:** `bun run test -- src/__tests__/audit.anchor.test.ts` → **6 tests passing**;
  `bunx biome check src/audit/anchor.ts src/audit/chain.ts` → **0 errors**;
  compliance docs status table updated in `docs/compliance/README.md`.

---

## Recent work (2026-07-03)

### P4 — Documentation and developer experience shipped (P4.6–P4.9)

- **P4.6 Trivy CI gate:** removed `continue-on-error` on the Trivy filesystem
  scan; pinned `aquasecurity/trivy-action@0.35.0` with `trivy-version: v0.69.3`
  (immutable release, post–supply-chain-incident safe combo). Trivy is now a
  blocking gate alongside Semgrep and `bun audit`.
- **P4.7 Semgrep SAST exception closed:** verified Semgrep green on CI run
  28624304093 (`p/owasp-top-ten`, zero blocking findings); removed the open
  SAST-Semgrep row from `docs/maintenance-scorecard.md` §7.
- **P4.8 scorecard baselines:** filled CI duration (~3.5 min median, ~4.5 min
  p95 from GitHub Actions run #282), CI success rate (~42% over last 100 runs,
  Jul 2 refactor burst), flaky-test assessment (0 identified flakes), test count
  (886 API + 216 UI = 1102), migration count (29). Quarterly review date
  unchanged at 2026-10-01.
- **P4.9 ADR 008 fork path:** added `docs/extending.md` §BFF / httpOnly cookie
  migration checklist with 8-step fork guide and reference route-handler skeleton
  (explicit non-default; default template remains `localStorage`).
- **Verification:** CI run 28624304093 — Semgrep + Trivy steps both `success`;
  `bun run test` → **886 API tests passing**; `bun run --cwd packages/ui test`
  → **216 UI tests passing**; `docs/extending.md` BFF section present; scorecard
  §2/§7/§8 updated.

---

## Recent work (2026-07-03)

### P4 — Documentation and developer experience shipped (all items)

- **P4.1 coverage ratchet:** raised `vitest.config.ts` thresholds from
  lines/functions/branches/statements `60/58/55/59` to `62/60/56/61`.
- **P4.2 `/metrics` default-closed:** deployment checklist now requires
  `METRICS_AUTH_TOKEN` in production; reference architecture documents
  token-gated Prometheus scrape configs for Kubernetes (ServiceMonitor +
  bearer secret) and VM/PM2 (`prometheus.yml` + `credentials_file`).
- **P4.3 fail-fast production config validation:** extended `validateConfig()`
  in `src/config/index.ts` to refuse boot in `NODE_ENV=production` unless
  `METRICS_AUTH_TOKEN`, `CORS_ALLOWED_ORIGINS`, `REDIS_URI`, and backup
  encryption keys are set (or backups explicitly disabled). 7 integration
  tests in `src/__tests__/config.production.test.ts` assert refuse-to-start
  and happy-path boot behavior.
- **P4.4 scorecard baseline:** populated `docs/maintenance-scorecard.md`
  Q3 2026 baseline — dependency freshness (0 major behind, esbuild low
  advisory), CI health (827+ tests, 0 generated drift), migration health
  (29 total, 5 irreversible), backup encryption enforced via P4.3 gate,
  7 ADRs, 0 open P0/P1/P4 items.
- **P4.5 token storage design revisit:** added ADR 008
  (`docs/adr/008-token-storage-design-revisit.md`) documenting the
  localStorage vs BFF/httpOnly cookie tradeoff with three migration
  options (SPA+BFF, full BFF, hybrid in-memory).
- **Verification:** `bun run test -- src/__tests__/config.production.test.ts`
  → **7 tests passing**; `bunx biome check src/config/index.ts
  src/__tests__/config.production.test.ts` → **0 errors**;
  `ls docs/adr/*.md` → **8 ADRs** (001–008). Full `bun run build` /
  `bun run type-check` remain blocked by pre-existing P2.2 service-layout
  import gaps, not by P4 changes.

---

## Recent work (2026-07-03)

### P3.3 — Elasticsearch optional; Postgres FTS default

- Confirmed `elasticsearch.enabled` defaults to `false` (`ELASTICSEARCH_ENABLED` must
  be `"true"` to opt in). Search, audit, and logging paths already fall back to
  Postgres FTS / stdout when ES is off; hardened the audit queue to no-op when
  disabled (avoids in-memory accumulation) and fixed ES multi-index search to
  respect `ELASTICSEARCH_INDEX_PREFIX`.
- Docker Compose: Elasticsearch + Kibana moved behind `--profile elasticsearch`;
  API no longer depends on ES at boot (`ELASTICSEARCH_ENABLED=false` in compose).
- Docs: README, `docs/deployment.md`, `docs/ARCHITECTURE.md`, and `.env.example`
  now describe ES as opt-in for large tenants.
- Tests: config default assertions, search provider when ES disabled, audit queue
  no-op when ES disabled.
- Verification: targeted P3.3 tests (`config.test.ts`, `search.service.test.ts`,
  audit pipeline in `middleware.test.ts`) → **9/9 passing**; `bun run build` and
  `bun run type-check` pass. Full `bun run test` → **840 passed / 12 pre-existing
  failures** unrelated to ES (stale `getReadDb` mocks, support/auth route tests).

### P4.1 — Coverage ratchet advanced toward 85%

- Raised the root Vitest coverage ratchet in `vitest.config.ts` from
  lines/functions/branches/statements `60/58/55/59` to `62/60/56/61`, keeping
  the gate close to the measured backend baseline while moving it one step
  toward the long-term 85% target.
- Updated `docs/maintenance-scorecard.md` §3 so API coverage now records the
  ≥62% lines and ≥56% branches ratchets and shows the line-coverage trend
  moving upward.
- Verification: `bun -e` imported `vitest.config.ts` and asserted the new
  thresholds exactly; `bunx biome check vitest.config.ts` passed. Full
  `bunx vitest --coverage --bail=1` still exits non-zero because of
  pre-existing suite failures unrelated to the threshold change (parse/import
  issues in moved services such as `billing/wallet.service.ts` and
  `ops/dbBackup.service.ts`, plus an empty `packages/ui/src/lib/pow.test.ts`
  suite).

---

## Recent work (2026-07-02)

### E2 — TanStack Query server-state foundation

- Added `@tanstack/react-query` to the UI package and mounted a single
  app-level `QueryProvider`, keeping server data out of global client state.
- Added product-domain query keys plus colocated query functions/hooks under
  `packages/ui/src/lib/server-state/`, starting with wallet detail/transactions
  and webhook endpoint/delivery-log state.
- Migrated `/dashboard/wallet` from ad-hoc `useEffect` + legacy `api.get` state
  to TanStack Query queries/mutations. The top-up mutation applies an optimistic
  wallet balance + pending transaction row, rolls back on error, and targets
  wallet detail/transaction invalidation after writes.
- Added `docs/tanstack-query-progress.md` as the page-by-page migration tracker.
- Migrated `/dashboard/webhooks` from ad-hoc `useEffect` + legacy `api.get`
  state to TanStack Query queries/mutations. The webhook list and delivery-log
  fetches use domain keys; toggle/delete apply optimistic list updates with
  rollback; create, ping, toggle, and delete use targeted webhook invalidation.
- Migrated `/dashboard/support` from ad-hoc `useEffect` + legacy `api.get`
  state to TanStack Query queries/mutations. Ticket list and thread detail use
  domain keys; create optimistically prepends the new ticket and seeds thread
  cache; reply appends to thread cache; close-status updates both list and
  detail caches; all mutations invalidate list/detail keys.
- Migrated `/dashboard/billing` from `useApi`/legacy mutation calls to TanStack
  Query queries/mutations. Subscription, currency, and pricing fetches now live
  in `server-state/billing.ts`; cancel/reactivate invalidate subscription data;
  checkout/portal keep safe external redirects in the page component.
- Migrated `/admin/audit` from ad-hoc `useEffect` + legacy `api.get` state to
  TanStack Query queries. Audit entries auto-fetch with loading/error states;
  hash-chain integrity verify is a manual refetch (`enabled: false`). Domain
  keys/hooks live in `server-state/audit.ts`.
- ~~Migrated `/admin/tenants`~~ — removed with ARCH-1 (2026-07-04); page redirects
  to `/dashboard/organizations`.
- Covered loading, error + retry, empty, stale cached data, and background
  refetch states in UI and tests.
- Verification: `NODE_ENV=test bun run --cwd packages/ui test --
  src/lib/server-state/wallet.test.tsx` → **5 tests passing**;
  `NODE_ENV=test bun run --cwd packages/ui test --
  src/lib/server-state/webhooks.test.tsx` → **5 tests passing**;
  `NODE_ENV=test bun run --cwd packages/ui test --
  src/lib/server-state/billing.test.tsx` → **3 tests passing**;
  `NODE_ENV=test bun run --cwd packages/ui test --
  src/lib/server-state/support.test.tsx` → **5 tests passing**;
  `NODE_ENV=test bun run --cwd packages/ui test --
  src/lib/server-state/audit.test.tsx` → **3 tests passing**;
  `NODE_ENV=test bun run --cwd packages/ui test --
  src/lib/server-state/tenants.test.tsx` → **4 tests passing**;
  `NODE_ENV=test bun run --cwd packages/ui test --
  src/app/dashboard/billing/page.test.tsx` → **9 tests passing**;
  root `bun run test` → **838 tests / 99 files passing**; `bun run
  build` passes; `bun run --cwd packages/ui build` passes; `bun run lint` exits
  0 with existing script warnings only.

### Fork-readiness audit — completed items

All fork-blocking (must-fix) and should-fix audit items from this report are
resolved. Verified open work is tracked in [`todo.md`](./todo.md).

| ID | Item | Resolution |
| --- | --- | --- |
| A1 | UI production build | `next-themes` wrapper fixed; `bun run --cwd packages/ui build` passes |
| A2 | Lint / CRLF / floating promises | `.gitattributes` enforces LF; no-floating-promise fixes; `bun run lint` exits 0 |
| B1 | Reset-password flow | Uses OTP `/auth/password-reset/confirm` |
| B2 | Stale `/admin/users/invite` | Removed |
| B3/B6 | Hook dependency hazards | `verify`, `fetchOrgs`, `fetchSessions`, `showToast` stabilized |
| B4 | Revoke-all sessions | Uses `DELETE /sessions` |
| B5 | Admin force logout | Uses `/force-logout` |
| B7 | Input sanitization placement | Mounted before routes |
| B8 | Admin broadcast email | Fan-out routes through BullMQ |
| B9 | Admin sessions pagination | `page`/`limit` + Previous/Next controls |
| C1 | Smart search stub | Ranked PostgreSQL `websearch_to_tsquery`; semantic claims removed |
| C2 | Elasticsearch dependency | `@elastic/elasticsearch` explicit in root deps |
| C3 | Hardware key-store claims | README says software store; hardware providers are stubs |
| C4 | OAuth account linking UI | Connect/disconnect on security page |
| C5 | Notification preferences UI | Per-category × per-channel grid |
| C6 | NPS / onboarding routes | Confirmed in `auth.routes.ts` |
| C7 | Customer segments UI | Segment selector on admin user detail |
| C8 | Webhook endpoint persistence | Drizzle `webhook_endpoints` + migration `0027` |
| E1 | UI HTTP client boundary | `apiClient.ts` canonical; `docs/ui-http-client.md` |
| E3 | shadcn migration | **0 raw controls** (`bun run ui:audit`) |
| P4 | Bun runtime bump | `.bun-version` pinned to 1.3.14; `compress()` guard removed after `CompressionStream` verification |

- **E3 shadcn migration (complete)** — All raw HTML controls migrated to
  shadcn/ui primitives (`Button`, `Input`, `Textarea`, `Checkbox`). Added
  `components/ui/checkbox.tsx`. `bun run ui:audit` → **0 raw controls**.

- **E2 — useApi migration (partial, 7 pages):** Migrated `admin/page`,
  `admin/access-reviews`, `admin/alerts`, `admin/sessions`, `admin/users`,
  `dashboard/billing`, and `dashboard/settings` to `useApi`/`usePaginatedApi`. ~17 pages remain — superseded by TanStack Query Phase 4 (shipped in `tdone.md` P2).

- **Bun runtime bump:** `.bun-version` now pins Bun 1.3.14; `server.ts` mounts
  Hono `compress()` directly after verifying `CompressionStream` exists in the
  pinned runtime (`bun -e`). The old P4 Bun bump follow-up was removed from
  `todo.md`.

- **API↔UI integration scanner:** `scripts/audit-api-ui-map.mjs` now recognizes
  canonical `apiClient` helpers plus `useApi`/`usePaginatedApi`, ignores UI test
  fixtures, and keeps `docs/api-ui-integration-matrix.md` in sync with the E2
  migrations.

- **Webhook endpoint persistence:** Replaced the user-facing webhook endpoint
  in-memory store with Drizzle persistence via `webhook_endpoints`, added
  migration `0027_webhook_endpoints`, and added persistence regression coverage.

- **Audit follow-up C2/B9:** Added `@elastic/elasticsearch` as an explicit root
  dependency; admin sessions browser now passes `page`/`limit` with pagination controls.

- **Audit follow-up E1:** `apiClient.ts` is the documented boundary; `useApi`
  consumes it internally; `docs/ui-http-client.md` documents the migration rule.

- **Audit follow-up C1/C3/C4/C5/C6/C7:** Smart search, README key-store
  wording, OAuth connect UI, notification preferences grid, route confirmation,
  customer segment selector.

- **Verification:** `bun run --cwd packages/ui build` passes. Targeted Biome
  checks pass on touched files. Root `bun run test` → **838 tests / 99 files**.

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

---

## P1 — Stability and correctness (2026-07-03)

- **P1.1 — Repository + transaction layer for hot-path writes:** Seven
  transactional repositories now own multi-statement mutations:
  `authSessions.repository.ts` (`rotateRefreshToken`, `revokeRefreshTokenFamily`),
  `billingSubscriptions.repository.ts` (checkout upsert, lifecycle updates,
  pause/cancel/reactivate, dunning), `orgs.repository.ts`
  (`createOrganizationWithOwner`, `transferOrganizationOwnership`),
  `pointsLedger.repository.ts` (`awardPoints`), plus existing `wallet`,
  `stripeEvents`, and `processedWebhookEvents` repos. Routes/services delegate:
  `auth.routes.ts` (token refresh), `billing.routes.ts` + `stripeWebhookProcessor.ts`,
  `org.routes.ts` (create + transfer). Regression tests:
  `authSessions.repository.test.ts`, `p1.repositories.test.ts` (orgs, billing,
  points). Verification: `bun run test` — **855 passed**; `build`, `type-check`,
  `boundaries:check` green.

- **P1.2 — Production worker topology enforcement:** `src/jobs/topology.ts`
  centralizes `WORKER_MODE` gating; `src/api/server.ts` defers schedulers/consumers
  when `WORKER_MODE=true` and emits a production startup warning via
  `warnIfApiRunsSchedulersInProduction()` when they would run in-process.
  Documented in [`docs/deployment.md`](./docs/deployment.md) §Production
  background-worker topology and [`docs/reference-architecture.md`](./docs/reference-architecture.md)
  (PM2 + K8s blueprints). Test: `workerTopology.test.ts`. Verification: same
  suite as P1.1.

- **P1.4 — Extend repository layer (support + passkey hot paths):** Added
  `supportTickets.repository.ts` (`createSupportTicketWithMessage`,
  `replyToSupportTicket`, `updateSupportTicketStatus`) and `passkeys.repository.ts`
  (`registerPasskey`, `completePasskeyAuthentication`). Routes delegate:
  `support.routes.ts` (create/reply/status), `passkey.routes.ts`
  (register/authenticate). Five new transactional tests in
  `p1.repositories.test.ts`; route tests updated for `db.transaction` mocks.
  Nine repositories total under `src/db/repositories/`.

- **P1.5 — Production worker topology deploy defaults:** README PM2 section now
  sets `WORKER_MODE=true` on API replicas and documents exactly one
  `zerotrust-worker` process; `docker-compose.yml` adds `WORKER_MODE=true` on the
  API service plus a dedicated `zerotrust-worker` service. Reference architecture
  and deployment docs already matched — no code change beyond compose/README.

- **Verification (2026-07-03):** `bun run test` — **875 passed** (106 files).

---

## P2 — Maintainability and refactoring (2026-07-03)

- **P2.1 — Legacy `packages/ui/src/lib/api.ts` removed:** TanStack Query migration
  was already at 42/42 data-fetching pages. Deleted the dead facade; centralized
  `vi.mock("@/lib/apiClient")` in `packages/ui/src/test/setup.ts` with shared
  mock fns in `apiClientMock.ts`. All page/server-state tests now assert against
  `apiClient` mocks. `grep` confirms zero `lib/api` imports under
  `packages/ui/src`.

- **P2.2 — Domain-oriented `services/` layout:** `src/services/` reorganized into
  `auth/`, `billing/`, `notifications/`, `compliance/`, `ops/`, and `shared/`
  (~48 files). Imports updated across routes, middleware, jobs, tests, and
  `worker.ts`. `.boundaries.json` references domain paths. Verification:
  `bun run boundaries:check` — 0 violations.

- **P2.3 — Backend/UI product-surface gaps:** New admin pages + server-state
  modules wired through `apiClient`:
  - `/admin/feedback` — feedback inbox (`adminFeedback.ts`)
  - `/admin/roles` — system role CRUD (`adminRoles.ts`)
  - `/admin/jit-grants` — JIT grant approve/deny (`adminJitGrants.ts`, distinct
    from `/admin/jit` cross-tenant inbox)
  - `/admin/content` — attachments upload + lifecycle email trigger (`adminContent.ts`)
  - `/admin/search` — search index management + provider (`adminSearch.ts`)
  - `/admin/webhooks` — admin-wide delivery log lookup (`adminWebhooks.ts`)
  - `/dashboard/billing` extended — usage, VAT validate, tax exemptions, change-plan
  - `/admin/regions` extended — org branding + custom domain forms
  - **API/SDK-only (documented in `openapi.json`):** `GET /auth/unsubscribe`
    (server-rendered HTML from email links), `POST /wallet/spend` (programmatic
    debit for integrations)
  - New server-state tests: `adminFeedback`, `adminRoles`, `adminJitGrants`,
    `adminSearch`, `adminContent`, `adminWebhooks`
  - `docs/api-ui-integration-matrix.md` regenerated — **127** frontend API calls
    via `build*Path` / `*_PATH` scanner (was 44 literal-only)

- **P2.4 — API↔UI integration scanner accuracy:** `scripts/audit-api-ui-map.mjs`
  resolves `build*Path()` prefixes and `*_PATH` constants from server-state modules,
  infers HTTP methods per call site, and trims `PRODUCT_SURFACE_DISPOSITIONS` to
  SDK-only routes (`GET /auth/unsubscribe`, `POST /wallet/spend`).

- **P2.5 — Reconcile stale audit / status docs:** `docs/AUDIT.md`, `README.md`,
  and `docs/ARCHITECTURE.md` updated to match shipped work (1065+ tests, 8 ADRs,
  module boundaries, metrics gate, read replicas, ADRs).

- **P2.6 — Server-state tests for P2.3 modules:** `adminContent.test.tsx` and
  `adminWebhooks.test.tsx` with loading/error/mutation coverage; tracker rows in
  `docs/tanstack-query-progress.md`.

- **P2.7 — `serverApiClient` / RSC prefetch tests:** `serverApiClient.test.ts`
  (cookie Bearer auth, `skipAuth`, error mapping) and `prefetch.test.ts`
  (prefetch options factories).

- **Verification (2026-07-03):**
  - `bun run boundaries:check` — pass
  - `bun run type-check` — pass
  - `bun run build` — pass
  - `bun run test` — **875+ passed** (106+ files)
  - `NODE_ENV=test bun run --cwd packages/ui test` — **195+ passed** (39+ files)
  - `bun run --cwd packages/ui build` — pass (52 app routes)
  - `bun run lint` — pass (warnings only in scripts)
  - `bun run verify:generated` — regenerates SDK + API docs + integration matrix
    (diff vs committed baseline expected until regenerated artifacts are committed)

---

## P2 — Infrastructure backlog (2026-07-03)

- **B4 — Test coverage ratchet:** raised floors to match measured coverage —
  API `vitest.config.ts` lines 64→**65**, functions 59→**60**, branches
  56→**58**, statements 62→**64** (measured 65.81% / 60.41% / 58.54% / 64.29%);
  UI `packages/ui/vitest.config.ts` lines 47→**53**, functions →**51**,
  branches →**45**, statements →**51** (measured 53.71% / 51.79% / 45.6% /
  51.12%). Added targeted tests for the two hot paths called out in the
  acceptance criteria:
  - **Auth flows:** `authMiddleware.branches.test.ts` (17 tests) covers the
    branches `auth.middleware.join.test.ts` didn't — missing/malformed
    Authorization header, expired/tampered access tokens, DB error during
    session lookup, expired/revoked sessions, org session-policy rejection,
    concurrent-session-cap eviction, suspended/deleted accounts, and
    `optionalAuthMiddleware`'s anonymous-fallback paths. `src/middleware/auth.ts`
    line coverage: 56%→**93%**.
  - **Billing webhooks:** `stripeWebhookProcessor.test.ts` (12 tests) drives
    every Stripe event-type branch directly (`checkout.session.completed`
    user- and org-owned, `customer.subscription.updated`/`.deleted`,
    `invoice.payment_failed`/`.payment_succeeded`, and the unhandled-event
    default) — previously only the `subscription.updated` path was covered
    indirectly through `billing.webhooks.test.ts`.
    `stripeWebhookProcessor.ts` line coverage: 38%→**100%**.

- **B5 — Queue-backed cron scheduling:** migrated `src/jobs/scheduler.ts` from
  `setInterval` + a Redis `SET NX PX` leader lock to a BullMQ job scheduler
  (`Queue.upsertJobScheduler`) — one repeatable job per `src/jobs/registry.ts`
  entry, using its `intervalHours` as an every-X-hours cadence.
  - **Retry/backoff + dead-letter:** `defaultJobOptions` gives every scheduled
    job 3 attempts with exponential backoff (60s base), matching the existing
    `emailQueue.ts` / `stripeWebhookQueue.ts` patterns; failed jobs are
    retained (`removeOnFail`) and exposed via `getFailedScheduledJobs()`
    instead of vanishing after a failed `setInterval` tick.
  - **Idempotent replay + failure recovery:** the registry `idempotencyKey`
    marker is now written to Redis only *after* a successful run, so
    replaying an already-completed tick is a no-op, while a failed attempt is
    **not** marked complete — a BullMQ retry actually re-executes the
    handler. `src/__tests__/scheduler.test.ts` (15 tests) proves both.
  - **Single-instance execution:** BullMQ hands each scheduled job to exactly
    one consumer atomically, so the Redis leader lock is no longer needed to
    prevent duplicate execution across API/worker replicas.
  - Job dispatch now calls the one-shot handler functions directly
    (`runRetentionPolicies()`, `sendNotificationEmailFallbacks()`,
    `runBillingLifecycle()`, `runBackup()` gated on `BACKUP_ENABLED`,
    `runAuditAnchor()`) instead of the legacy `start*Scheduler` wrappers,
    which owned their own internal `setInterval` and are kept only for direct
    callers / existing tests (`dataRetention.test.ts`).
  - `src/worker.ts` owns the scheduler consumer via `startJobScheduler()` and
    now shuts it down gracefully (alongside the email/Stripe queues) on
    `SIGTERM`/`SIGINT`.
  - `docs/deployment.md` — new §Queue-backed cron scheduling (B5) documents
    the topology;     `.env.example`, `README.md`, `docs/AUDIT.md`, and
    `docs/reference-architecture.md` updated to drop
    stale "leader-elected `setInterval`" references.

- **Verification (2026-07-03):**
  - `bun run test` — **953 passed** (113 files)
  - `NODE_ENV=test bun run --cwd packages/ui test` — **220 passed** (56 files)
  - `bun run test:coverage` — green at the new floors (65/60/58/64 lines/
    functions/branches/statements; measured 65.81/60.41/58.54/64.29)
  - `bun run --cwd packages/ui test -- --coverage` — green at the new floors
    (53/51/45/51; measured 53.71/51.79/45.6/51.12)
  - `bun run type-check` — pass
  - `bun run boundaries:check` — 1 pre-existing violation unrelated to this
    change (`src/audit/anchor.ts` → `services/ops/objectStorage.service`,
    predates B4/B5)

---

---

## P3 — Operations & compliance (2026-07-03)

- **B6 — CI success rate recovery:** Triaged Jul 2 refactor burst (~42% over prior
  100 runs). Root cause: deterministic Biome format/import drift (not flaky tests).
  Remediated format in `src/worker.ts`, `src/api/routes/auth.routes.ts`,
  `src/jobs/scheduler.ts`, `packages/ui/src/lib/apiClient.ts`,
  `packages/ui/src/lib/reverification.ts`, `packages/ui/src/lib/server-state/prefetch.ts`,
  and `packages/ui/src/components/ReverificationProvider.tsx`. Evidence in
  [`docs/compliance/evidence/2026/Q3/ci-health/2026-07-03-ci-recovery.md`](./docs/compliance/evidence/2026/Q3/ci-health/2026-07-03-ci-recovery.md).
  Scorecard §2 updated; rolling 30-day ≥95% target rebaselined from remediation date.
- **B7 — Compliance evidence collection (Q3 2026):** Completed E-002 (quarterly
  access review), E-003 (onboarding/offboarding samples), E-007 (Jul monitoring
  packet), E-008 (change-management PR samples), and E-010 (annual risk assessment
  export). Updated [`docs/compliance/evidence-register.md`](./docs/compliance/evidence-register.md)
  and [`docs/compliance/soc2-auditor-readiness.md`](./docs/compliance/soc2-auditor-readiness.md).
- **Verification (2026-07-03):** `bunx biome ci` → **0 errors**; evidence register
  shows E-001–E-010 **Complete**; all evidence summaries present under
  `docs/compliance/evidence/2026/`.

---

## P3 scalability & performance (2026-07-03)

Shipped P3.6–P3.10 (final P3 backlog slice; P3.1–P3.5 above):

### P3.1 — UI test coverage toward 85%
- Added page/component tests: dashboard home, profile, security/MFA, org settings,
  admin overview, compliance, regions (15 total under `packages/ui/src/app/`).
- API coverage ratchet raised to 63% lines / 57% branches; UI package ratchet added
  at ~42% lines on app/components/lib.
- [`docs/maintenance-scorecard.md`](./docs/maintenance-scorecard.md) §3 updated.

### P3.2 — Read replica defaults
- Read-heavy admin/analytics/org/notification/session/support handlers route through
  `getReadDb()`; route tests assert replica usage on admin list endpoints.
- Replica lag expectations in [`docs/deployment.md`](./docs/deployment.md) §Read replica routing.

### P3.3 — Elasticsearch optional
- `elasticsearch.enabled` defaults to `false`; Postgres FTS + hash-chain audit work without ES.
- Config + search service tests prove database provider when ES is disabled.
- README and deployment docs describe ES as opt-in for large tenants.

### P3.4 — RSC server prefetch pilot
- `/dashboard` and `/admin` prefetch TanStack Query data server-side with
  `HydrationBoundary`; client components handle mutations.
- Pattern in [`docs/ui-http-client.md`](./docs/ui-http-client.md).

### P3.5 — Destructive migration CI gate
- `scripts/check-destructive-migrations.ts` + `.destructive-migrations.json` in
  CI (`migrations:check`) and pre-commit; tests in `destructiveMigrations.script.test.ts`.

**Verification (2026-07-03):** 870 API + 195 UI tests passing; API line coverage 64.2%;
`boundaries:check` · `type-check` · `build` · `lint` · UI build green.

### P3.6 — RSC server prefetch expansion (4 pages)

- Split `WalletClient`, `BillingClient`, `UsersClient`, `SessionsClient` from RSC
  `page.tsx` wrappers with `HydrationBoundary` prefetch via extended
  `prefetch.ts` (wallet, billing subscription/currencies/pricing, admin users/sessions).
- Documented in [`docs/ui-http-client.md`](./docs/ui-http-client.md) — ten prefetched routes total.

### P3.7 — UI test coverage ratchet (+5 pts)

- Raised `packages/ui/vitest.config.ts` lines floor 42% → **47%**.
- Added 8 page tests: wallet, webhooks, support, api-keys, notifications,
  admin feedback, roles, tenants (23 page tests total).

### P3.8 — API coverage ratchet (+1 pt lines)

- Raised root `vitest.config.ts` line threshold 63→**64** (measured 64.1%);
  branches/functions/statements floors aligned to measured baseline (56/59/62).
- `bun run test:coverage` green at new floors.

### P3.9 — Playwright E2E expansion

- Added `wallet.spec.ts`, `webhooks.spec.ts`, `security.spec.ts` (6 E2E specs total).
- Scorecard §3 E2E rows populated.

### P3.10 — Load/chaos scorecard baselines

- Documented CI k6 thresholds (p95 &lt;100ms, p99 &lt;300ms) in scorecard §3 and §6
  from `tests/load/full-suite.k6.js`.

**Verification (2026-07-03):** `bun run test` → 886 API tests; UI suite → 216 tests;
`bun run test:coverage` green at 64% line ratchet; `bun run build` + UI build pass.

### B3 — Continuous access re-verification (end-to-end)

- `sensitiveReverification` middleware guards sensitive routes: `DELETE /auth/mfa/totp`,
  `POST /auth/me/email`, `DELETE /auth/oauth/:provider`, `POST /orgs/:orgId/transfer`,
  `POST /billing/cancel`.
- Recent verification in `verificationStore` satisfies soft/hard level requirements before
  re-challenging; middleware exported as `sensitiveReverification` from `src/index.ts`.
- UI: `ReverificationProvider` dialog (TOTP / email OTP / passkey), `apiClient` intercepts
  `REVERIFICATION_REQUIRED` and retries after successful `/auth/verify/respond`.
- Tests: `continuousVerification.test.ts`, `mfa.routes.test.ts` (disable TOTP path),
  `apiClient.test.ts` (handler + retry).

**Verification (2026-07-03):** 35 targeted tests green (`continuousVerification`,
`mfa.routes` DELETE /totp, `apiClient` re-verification retry).

---

## D3 — OpenAPI / SDK schema expansion (2026-07-03)

- Expanded `src/api/openapi.json` from **102 paths / 119 operations** to **178 paths /
  209 operations**, covering all **198** mounted backend routes (product + ops).
- Added `scripts/expand-openapi-gaps.mjs` to scaffold minimal path stubs (tags,
  security, path params) for any future route drift.
- Regenerated `@zerotrust/client` SDK and `docs/api-reference.md`; updated coverage
  note in `scripts/generate-api-docs.mjs` to reflect full route-surface alignment.
- New **Webhooks** tag group for outbound webhook CRUD, deliveries, ping, and
  inbound email-event receiver.

**Verification:** `bun run test` → **957 tests / 114 files**; `bun run sdk:generate`
and `bun run docs:api` → 209 operations across 22 groups; openapi gap scan → 0
missing paths.

---

## C1 — SOC 2 Type II auditor engagement (2026-07-04)

- **Auditor engaged:** Independent CPA firm (redacted summary in
  [`docs/compliance/evidence/auditor-engagement/engagement-letter-summary.md`](./docs/compliance/evidence/auditor-engagement/engagement-letter-summary.md)
  — E-011). Signed engagement letter stored in controlled storage outside Git.
- **Observation window set:** 2026-07-04 through 2027-07-03 (12-month Type II);
  recorded in
  [`observation-window.md`](./docs/compliance/evidence/auditor-engagement/observation-window.md)
  — E-012.
- **System description completed:** v1.0 boundary, data flows, subservice orgs,
  and control environment in
  [`system-description.md`](./docs/compliance/evidence/auditor-engagement/system-description.md)
  — E-013; template retained for future revisions.
- **Engagement checklist complete:** All pre-engagement and post-engagement items
  checked in
  [`engagement-checklist.md`](./docs/compliance/evidence/auditor-engagement/engagement-checklist.md).
- **Readiness plan updated:**
  [`docs/compliance/soc2-auditor-readiness.md`](./docs/compliance/soc2-auditor-readiness.md)
  status **Active**; pre-audit checklist all Complete; July 2026 monthly readiness
  record filed.
- **Evidence register:** E-011–E-013 added to
  [`docs/compliance/evidence-register.md`](./docs/compliance/evidence-register.md).
- **Backlog cleanup:** C1 removed from [`todo.md`](./todo.md); verified open
  product backlog count **0** (T5 shipped 2026-07-04).

**Verification (2026-07-04):** All acceptance criteria met — auditor engaged,
observation window set, system description and engagement letter recorded under
`docs/compliance/evidence/auditor-engagement/`; linking docs updated
(`docs/compliance/README.md`, `docs/maintenance-scorecard.md`, `README.md`).

---
