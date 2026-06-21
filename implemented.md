# ZeroAuth — Implemented Features

This file is the authoritative list of what ZeroAuth ships today. Anything not on
this list lives in [`not-implemented.md`](./not-implemented.md).

Sources of truth: `src/` (backend), `packages/ui/src/` (frontend), and Drizzle
migrations in `src/db/`. Update this file when you ship a feature, not the other
way around.

**Legend:** ✅ shipped · `[~]` partial / behind a flag · ⚡ backend exists,
needs surfacing

---

## Auth & Identity

- ✅ Email + password auth with account lockout (configurable threshold + auto-unlock)
- ✅ Google, GitHub, Apple, Facebook OAuth (admin-toggleable per method)
- ✅ Magic link (passwordless, 15-min TTL, email-delivered)
- ✅ Passkeys / WebAuthn FIDO2 (register, authenticate, resident keys)
- ✅ TOTP (Google Authenticator, Authy, 1Password)
- ✅ Email OTP, SMS OTP (Twilio), WhatsApp OTP, Telegram OTP
- ✅ PASETO v4 access tokens (AES-256-GCM, 1-hour TTL, no JWT footguns)
- ✅ Refresh tokens (SHA-256 hashed, rotated on use, long-lived)
- ✅ Session management — list, revoke, device fingerprinting
- ✅ RBAC + ABAC with JIT privilege escalation
- ✅ Continuous access evaluation — re-verification challenges after sensitive ops
- ✅ Anomaly detection — flags unusual login location / time / device
- ✅ Rate limiting — per-IP sliding window, Redis-backed with in-memory fallback
- ✅ Account lockout (per-account) + credential-stuffing defense (per-IP)
- ✅ HIBP (HaveIBeenPwned) breach check on register / password change (`HIBP_CHECK_ENABLED`, fails open)
- ✅ Login notification email — new-device alert with one-click revoke link
- ✅ Account takeover detection — password reset + email change in <1h revokes other sessions, alerts both emails
- ✅ Disposable-email blocking — throwaway-domain rejection + optional MX validation (`DISPOSABLE_EMAIL_*`)
- ✅ Silent token refresh — UI replays a 401 via `POST /auth/token/refresh`, redirects to login on failure
- ✅ Protected routes — client guards on `/dashboard` + `/admin`, redirect signed-out users

### OIDC / SSO

- ✅ OIDC provider — full OpenID Connect server
- ✅ SAML 2.0 SSO — SP-initiated for Okta, Azure AD, Google Workspace
- ✅ SCIM 2.0 — auto-provision / deprovision users from IdP (RFC 7644)
- ✅ LDAP / Active Directory sync

### Advanced identity (DID, federation, agents)

- ✅ Decentralized identity — `did:key` / `did:web` resolver + proof-of-control challenge (`/admin/did`)
- ✅ Identity federation — RFC 8693 token exchange + trusted-provider registry (`/admin/federation`)
- ✅ Workload / agent identity — scoped client-credential tokens with `principal_type: agent` (`/admin/workload`)
- ✅ Cross-tenant JIT access — request + admin approval inbox, auto-expiring grants (`/dashboard/jit`, `/admin/jit`)
- ✅ `[~]` FIDO attestation & MDS3 verification — `AttestationPolicy`, `KNOWN_HARDWARE_KEY_AAGUIDS`, CA-pin store
- ✅ `[~]` On-behalf-of / "act-as" delegation — `exchangeToken()` implements actor claims

---

## Organizations & Teams

- ✅ Workspace model — one org → many members, one user → many orgs
- ✅ Invite by email — time-limited signed invite links
- ✅ Org roles — owner, admin, member, viewer with permission checks
- ✅ Custom org roles & permissions — fine-grained resource permissions per org
- ✅ Transfer ownership — reassign with confirmation flow
- ✅ Org settings — name, logo, slug, billing contact
- ✅ Remove / leave org — safety checks (cannot remove last owner)
- ✅ Per-org IP allowlist — `org_security_policies.ip_allowlist` (IPv4 CIDRs, migration `0009`), enforced via shared `cidr.ts` matcher
- ✅ Org passkey policy — `requirePasskeyAttestation` / `requireHardwarePasskey` / `allowedPasskeyAaguids` / `deniedPasskeyAaguids` in `org_security_policies`; enforced at registration via MDS3 attestation + AAGUID lookup; `GET/PUT /:orgId/security/policy` admin-gated; UI in org Settings → Security policy form
- ✅ Cross-tenant JIT access — request + approval inbox + durable audit (`cross_tenant_jit_requests`, migration `0003`)

---

## Billing & Subscriptions

- ✅ Stripe checkout — creates Checkout Session, returns URL
- ✅ Stripe customer portal — manage cards, cancel, download invoices
- ✅ Stripe webhook handler — `subscription.updated`, `invoice.payment_failed`, `subscription.deleted`
- ✅ `subscriptionsTable` — plan, status, period dates per user
- ✅ `requirePlan()` middleware — `403 PLAN_REQUIRED` when feature not on plan
- ✅ `PLAN_CONFIGS` in `src/shared/plans.ts` — free / pro / enterprise feature matrix
- ✅ Per-org billing — one subscription per organization
- ✅ Trial period — 14-day trial with expiry email + upgrade prompt
- ✅ Upgrade / downgrade flows — Stripe proration (immediate or period-end)
- ✅ Usage counters — API calls metered, seats live-counted, `GET /billing/usage` reports vs limits
- ✅ Dunning management — D3 / D7 / D14 escalating emails for past_due
- ✅ Cancellation flow — offboarding survey + pause-instead + retention coupon
- ✅ Win-back campaign — automated D7 / D30 / D90 emails (optional coupon)
- ✅ Manual plan override — `PUT /admin/users/:id/plan` from admin panel

---

## API Keys (developer API)

- ✅ API key model — named keys, SHA-256 hashed (never stored plain), scopes, per-user or per-org
- ✅ Key creation UI — generate key, show plaintext once, copy to clipboard
- ✅ `lastUsedAt` timestamp updated on every request
- ✅ Revoke — instant revocation via `revokedAt`
- ✅ Key scopes — `read:data`, `write:data`, etc. enforced in middleware
- ✅ `apiKeyAuth` middleware — `Bearer <key>` or `X-API-Key` header
- ✅ Sandbox / test-mode keys — `api_keys.environment` column (migration `0006`); `zak_live_` / `zak_test_` prefix; `X-ZeroAuth-Environment` response header; Live/Test selector in dashboard

---

## Email & Notifications

### Email pipeline

- ✅ BullMQ email queue — non-blocking transactional delivery, Redis-backed retry
- ✅ Nodemailer SMTP transport — configurable host / port / credentials
- ✅ Transactional templates — welcome, verify, invite, receipt, magic link, password reset
- ✅ Inline-styled HTML templates
- ✅ Notification preferences — users choose which emails to receive
- ✅ Unsubscribe tokens — HMAC-SHA256 signed, one-click CAN-SPAM unsubscribe
- ✅ Welcome email on registration
- ✅ Trial expiry warning emails
- ✅ Dunning emails — failed-payment escalation sequence
- ✅ Win-back emails — D7 / D30 / D90 after cancellation
- ✅ Security alert emails — new-device login, account-takeover pattern
- ✅ Billing-event template — reusable title/body/CTA layout for lifecycle emails
- ✅ Email suppression list — `email_suppressions` table (migration `0011`); `sendEmail()` skips suppressed recipients; provider-agnostic `POST /webhooks/email/event` for bounce/complaint
- ✅ Email deliverability hardening — SPF/DKIM/DMARC runbook + suppression enforcement ([`docs/email-deliverability.md`](./docs/email-deliverability.md))

### Notification center

- ✅ Notification model — per-user with `read` / `unread` state
- ✅ Bell icon + dropdown — notification center in dashboard nav
- ✅ Mark as read — single + bulk
- ✅ Real-time delivery — Server-Sent Events (SSE) push
- ✅ Notification preferences — granular per-channel per-category control
- ✅ Email fallback — deliver via email if user hasn't visited in N days
- ✅ Web push notifications — VAPID `webPush.service.ts`, `push_subscriptions` table (migration `0005`), `/notifications/push/*` endpoints, SW `push` handler; per-device opt-in on `/dashboard/notifications`; fires from `broadcastNotification` even when PWA is closed
- ✅ Usage-based upsell nudges — `usageNudge.service.ts` (warning ≥80%, exceeded ≥100%) wired into `apiKeyAuth` after metering
- ✅ Broadcast email — `/admin/revenue` composer sends announcements to all or segments

---

## User Dashboard

- ✅ Profile — display name, avatar, language preference
- ✅ Security — password change, MFA (TOTP + passkeys), active sessions
- ✅ Sessions — list active sessions with device info, revoke any
- ✅ Account — GDPR data export, account deletion (30-day soft-delete)
- ✅ Settings — notification preferences
- ✅ Organizations — list, create, view members
- ✅ API Keys — create, list (prefix only), revoke
- ✅ Billing — plan cards, upgrade CTA, manage subscription
- ✅ Support — self-hosted threaded tickets (`/dashboard/support`); create + list + thread + reply
- ✅ App shell — shared responsive shell with collapsible sidebar, sticky topbar, footer (mobile drawer)

---

## Admin Panel

- ✅ Stats dashboard — user count, active sessions, recent registrations
- ✅ User management — list, search, view detail, edit roles, force logout, delete
- ✅ Session browser — view all active sessions, revoke any
- ✅ Audit log viewer — searchable immutable event trail
- ✅ Auth settings — toggle every auth method on/off live
- ✅ General settings — app name, URL, branding
- ✅ Impersonate user — `POST /admin/users/:id/impersonate`, 30-min audit-logged session
- ✅ Manual plan override — bump user to Pro, add trial days
- ✅ Broadcast email — announcement to all or filtered users
- ✅ Revenue metrics — MRR, ARR, churn, past-due, trial counts (`/admin/revenue`)
- ✅ Feature flag management — admin CRUD with global toggle, per-user force, % rollout
- ✅ CSV exports — users and audit logs
- ✅ Workload credential admin — issue + list + revoke (`/admin/workload`)
- ✅ Cross-tenant JIT admin — approve / deny / history (`/admin/jit`)
- ✅ Federation provider registry — list / register / remove trusted providers (`/admin/federation`)
- ✅ DID tool — resolve `did:key` / `did:web` + generate proof-of-control challenge (`/admin/did`)
- ✅ Legal hold — `POST /admin/users/:id/legal-hold` places/lifts (audited)

---

## GDPR, Compliance & Privacy

- ✅ GDPR data export — "Export my data" downloads JSON of all user data
- ✅ Account deletion — 30-day soft-delete grace period, then full PII purge
- ✅ Data retention — auto-purge audit logs, sessions, OTPs after configurable intervals
- ✅ Legal hold — `users.legal_hold` (+reason/at, migration `0010`); `purgeOldAuditLogs` excludes held users
- ✅ Cookie consent banner — GDPR-compliant accept / reject
- ✅ Privacy policy + Terms pages
- ✅ CAN-SPAM unsubscribe — one-click signed tokens
- ✅ Bug-bounty / responsible-disclosure page — `/.well-known/security.txt` (RFC 9116) + public `/security`
- ✅ SOC 2 Type II readiness map — controls mapped to TSC CC6–CC8, A1, C1/P ([`docs/soc2-readiness.md`](./docs/soc2-readiness.md))

---

## Security & Cryptography

- ✅ PASETO v4 — AES-256-GCM, no JWT footguns
- ✅ Refresh tokens — SHA-256 hashed, rotated on use
- ✅ Silent token refresh in UI
- ✅ Protected routes — client guards on `/dashboard` + `/admin`
- ✅ Disposable-email blocking — see Auth section
- ✅ Rate limiting — per-IP sliding window, Redis + in-memory fallback
- ✅ Account lockout — configurable threshold + auto-unlock
- ✅ RBAC + ABAC — roles, permissions, JIT escalation
- ✅ API keys — SHA-256 hashed, never stored plain
- ✅ Unsubscribe tokens — HMAC-SHA256
- ✅ HIBP password check
- ✅ Login notification emails
- ✅ Account takeover detection
- ✅ Security headers — Hono `secureHeaders` middleware on every route
- ✅ CSFLE field encryption — `CSFLEManager`, key versioning, encrypt/decrypt plugin
- ✅ `[~]` Post-quantum crypto — hybrid KEM (`createKEMProvider`, `generatePQKeyPair`, `establishPQSessionKey`, `hybridEncrypt/Decrypt`); not yet productized behind a flag

---

## Observability

- ✅ Prometheus metrics — `/metrics` endpoint (prom-client)
- ✅ OpenTelemetry tracing — `NodeSDK` with OTLP exporter, `withSpan()` helper, auto-instrumentation
- ✅ Sentry — `@sentry/node` server + `@sentry/nextjs` React error boundaries (server + browser)
- ✅ Structured logging — `getLogger()` with log levels + correlation IDs
- ✅ Audit log — immutable event trail to Elasticsearch + fan-out to SIEM (Datadog/Splunk/S3)
- ✅ Distributed tracing viewer — `docker-compose.tracing.yml` (Jaeger all-in-one, OTLP)
- ✅ Health status page — public `/status` page + endpoint (API / DB / cache)
- ✅ Alerting — Slack / Teams / PagerDuty on error spike or latency breach (cooldown, env-tunable)
- ✅ Kibana dashboards — pre-built 8.x dashboards for auth, MFA, denied-access, rate-limit, anomaly, overview ([`kibana/README.md`](./kibana/README.md))

---

## Webhooks (user-facing)

- ✅ Endpoint management — `/dashboard/webhooks` UI + REST CRUD
- ✅ Event catalog — typed `WebhookEventType` covering auth, user, session, anomaly
- ✅ Signed payloads — HMAC-SHA256 `X-ZeroAuth-Signature` header
- ✅ Test delivery — ping button sends a signed test event
- ✅ Retry with backoff — automatic retry on 5xx / timeout per endpoint retry policy
- ✅ `[~]` Delivery logs UI — bounded in-memory ring buffer (`webhookDeliveryLog`); per-attempt history via `GET /webhooks/:id/deliveries` (full Postgres durability deferred)

---

## Onboarding & UX

- ✅ Setup checklist — "complete your profile", "enable MFA", etc. (dismissable)
- ✅ Welcome email sent immediately on registration
- ✅ Empty states — shared `EmptyState` component
- ✅ Product tour — dependency-free first-login spotlight walkthrough (`ProductTour.tsx`), anchored to `[data-tour]` nav items, versioned localStorage key
- ✅ Dark mode — system preference + manual override, persisted
- ✅ Toast notifications — global context for success / error feedback
- ✅ Loading skeletons — skeleton screens
- ✅ Mobile-responsive — all pages usable on phone
- ✅ Live chat widget — `LiveChatWidget` (Crisp / Intercom / Tawk.to), config-driven, mounted in dashboard shell, env-driven via `NEXT_PUBLIC_CHAT_PROVIDER` / `NEXT_PUBLIC_CHAT_ID`
- ✅ Help center — `/help` searchable FAQ with category filter
- ✅ In-app NPS / feedback widget — thumbs up/down with per-feature context

---

## i18n

- ✅ next-intl installed, `NextIntlClientProvider` wrapping app
- ✅ Translation files — `/messages/{locale}.json` (en, es, fr)
- ✅ Locale detection — `Accept-Language` on first visit, cookie-persisted
- ✅ Language switcher — dropdown in nav + settings, persists to profile
- ✅ Locale-aware formatting — `lib/format.ts` + `useFormat()` over `Intl.DateTimeFormat` / `NumberFormat` / `RelativeTimeFormat` (used by `NotificationBell`)
- ✅ `[~]` Locale-aware email templates — `users.locale` (migration `0007`), `LocaleSwitcher` persists server-side; per-locale dictionary (`templates/emails/i18n.ts`, en/es/fr) with English fallback; welcome + verify-email fully localized
- ✅ Missing-translation fallback — English merged under active locale, missing keys logged in dev

---

## SEO & Marketing

- ✅ Landing page — hero, features, pricing sections (plain Tailwind)
- ✅ Blog — MDX-powered posts at `/blog`
- ✅ Changelog — versioned release notes at `/changelog`
- ✅ Meta tags — `<title>`, `<meta description>`, Open Graph, Twitter cards
- ✅ Sitemap.xml + robots.txt — generated at build time
- ✅ Cookie consent banner with consent-gated analytics
- ✅ Plausible Analytics — `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`
- ✅ Google Analytics 4 — `NEXT_PUBLIC_GA_MEASUREMENT_ID`

---

## PWA & Mobile

- ✅ PWA manifest — `manifest.json`, installable on mobile
- ✅ Offline support — `public/sw.js` precaches app shell + `offline.html`; mutating API calls queue in IndexedDB (`lib/offlineQueue.ts`), replay via Background Sync (with `online`-event fallback); `ServiceWorkerRegistrar` registers SW in production only
- ✅ Deep linking — invite (`/invite/:token`) + magic-link (`/magic-link/verify`) preserve `next` / `redirect`; manifest `scope` + `launch_handler: navigate-existing` opens inside installed PWA
- ✅ Web push — see Notifications section

---

## CI/CD & Deployment

- ✅ GitHub Actions CI — lint + type-check + test + UI build on every push / PR
- ✅ Docker Compose — full development stack (API + UI + PG + Redis + ES + Kibana)
- ✅ Dockerfile — multi-stage production image (Bun + Node)
- ✅ Railway one-click deploy button
- ✅ Render one-click deploy button
- ✅ Secret rotation — zero-downtime procedure documented in README
- ✅ Environment parity — `.env.staging.example` staging template
- ✅ DB backup — `bun run db:backup` runs `pg_dump` with 30-day retention, optional S3; daily in-server scheduler (`BACKUP_ENABLED=true`)
- ✅ DB restore + PITR — `bun run db:restore -- <dump> [--clean]` (`pg_restore --no-owner`), Neon PITR runbook, quarterly drill ([`docs/backup-restore.md`](./docs/backup-restore.md))

---

## File Storage & Uploads

- ✅ Avatar upload — JPEG / PNG / GIF / WebP, 5 MB limit

---

## Analytics & Reporting

- ✅ Revenue dashboard — MRR, ARR, churn, past-due, trials with by-plan breakdown
- ✅ Per-user usage stats — API calls + seats vs plan limits (`GET /billing/usage`)
- ✅ CSV export — admin can export users and audit logs

---

## Customer Support

- ✅ Self-hosted threaded tickets — `support_tickets` + `support_ticket_messages` tables (migration `0008`); owner-scoped listing; agents (`admin` or `support`) get `?all=true`; `/dashboard/support` create + list + thread + reply + status change

---

## Authentication UX Wiring

- ✅ Dashboard auth guard — `/dashboard/*` redirects signed-out users to `/login`; reacts to cross-tab token clears via `storage` event
- ✅ Admin auth guard — `/admin/*` redirected for non-admins
- ✅ GDPR self-serve wired — data-export + account-deletion page linked in dashboard nav, uses access token (not cookie)

---

## Advanced-backend UIs (surfaced 2026-06-15)

- ✅ DID resolver/challenge (`/admin/did`)
- ✅ Cross-tenant JIT request + approval inbox (`/dashboard/jit`, `/admin/jit`)
- ✅ Workload/agent identity (`/admin/workload`) — issue, list, revoke
- ✅ Federation provider registry (`/admin/federation`) — list / register / remove; durable via `federated_providers` table (migration `0003`)

---

## Shared Shell Refactor (2026-06-15)

- ✅ Shared responsive app shell (`components/app-shell/`) for dashboard + admin — `AppShell` + `AppSidebar` + `AppTopbar` + `AppFooter`; collapsible sidebar, slide-over drawer on mobile, sticky topbar + footer
- ✅ Workload credential list + revoke endpoints — `GET /workload/credentials`, `POST /workload/credentials/:id/revoke` (admin-only, secrets never returned)

---

## Durable Storage Upgrades

- ✅ Cross-tenant JIT store — `cross_tenant_jit_requests` table (migration `0003`); grants / approvals / history survive restarts; expiry computed read-time
- ✅ Federation provider store — `federated_providers` table (migration `0003`); `initFederationFromEnv()` reconciles env-declared providers on boot without clobbering UI-added ones

---

## API Versioning (2026-06-18)

- ✅ `middleware/apiVersioning.ts` — clients select via `X-API-Version` header or `/vN` path prefix; version registry tracks current/deprecated/sunset + sunset dates; RFC 8594 `Deprecation`/`Sunset`/`Link` headers on deprecated; `410 Gone` on past-sunset; `GET /api/versions` exposes registry

---

## Agent-aware Audit Log (2026-06-18)

- ✅ `shared/principal.ts` derives `AuditPrincipal` (human/agent + `workload_id` + `act_as` delegation chain) from token claims
- ✅ `auditLog()` tags every entry with `principal_type` (default `human`, so existing call sites are unchanged); workload agent-token mint logs with an agent principal

---

## Misc

- ✅ API versioning — see above
- ✅ Rate limiters — per-IP (Redis + in-memory fallback)
- ✅ HIBP breach check — see Auth section
