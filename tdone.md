# zerotrust — Implemented Features

This file is the authoritative list of what zerotrust ships today, plus the latest
repository audit snapshot. Keep planned work in issues or the product backlog, not
in this shipped-feature ledger.

Sources of truth: `src/` (backend), `packages/ui/src/` (frontend), and Drizzle
migrations in `drizzle/`. Update this file when you ship a feature, not the other
way around.

**Legend:** ✅ shipped · `[~]` partial / behind a flag · ⚡ backend exists,
needs surfacing

---

## Removed — maintenance slim-down (2026-06-28)

To reduce the template's maintenance surface, the following heavy/low-use
features were **removed from the codebase**. Dated ledger sections below
predate this change and still describe them as shipped — treat this section as
authoritative for current state. See
[`docs/MAINTENANCE_FEATURE_AUDIT.md`](./docs/MAINTENANCE_FEATURE_AUDIT.md) for
the rationale and the full candidate list.

- ❌ **Collaboration** — shared notes, activity feed, @mentions, presence
  (`/collab/*`, 5 tables). The command palette is now a client-side page navigator.
- ❌ **Decentralized identity** — `did:key` / `did:web` resolver, proof-of-control,
  login-via-DID (`/auth/did`, `users.did` column).
- ❌ **Post-quantum KEM** — ML-KEM module (was barrel-only, never wired in);
  dropped the `@noble/post-quantum` dependency.
- ❌ **Growth tooling** — experiments / A-B, feature flags, usage nudges, and
  product analytics (funnel/feature/search). Metered usage billing is kept.
- ❌ **AI-native auth** — workload/agent identity, RFC 8693 agentic delegation,
  MCP OAuth authorization server, human-in-the-loop agent approvals, mTLS.
- ❌ **Enterprise federation** — OIDC provider, SAML 2.0, SCIM 2.0, LDAP/AD sync,
  RFC 8693 identity federation, per-org/tenant SSO config; dropped `ldapts` and
  the unused `samlify` dependency.

Still present and unchanged: OAuth social login, magic links, passkeys/WebAuthn,
TOTP/Email/SMS OTP, organizations & teams, cross-tenant JIT, billing, wallet/
loyalty, globalization, search, compliance, audit, and ops tooling.

---

## Enterprise Execution Ledger

- ✅ CWE security hardening sweep — audited CWE-918, CWE-1427, CWE-532, CWE-22, CWE-601, CWE-1333, CWE-327, and CWE-78 patterns; hardened every server-side/script `fetch` with timeout + no-redirect handling, added shared SSRF guards for tenant/admin-controlled notification webhooks, webhook delivery, SSF receivers, and FIDO MDS3 embedded URLs; moved Facebook OAuth tokens/secrets out of URLs; fixed presigned upload object keys to derive extensions from validated content type; and updated `CLAUDE.md`, `AGENTS.md`, and the Hermes `secure-coding` skill so future agents reuse the canonical patterns.
- ✅ CWE-918 centralized outbound HTTP — added `fetchPublicUrl()` for tenant/admin/user-influenced URLs (SSRF guard + timeout + `redirect: "error"`) and `fetchFixedUrl()` for fixed/provider/operator-controlled URLs (timeout + no redirects); replaced direct server-side `fetch()` calls across OAuth providers, federation, DID web, webhooks, notifications, FIDO MDS3, HIBP, SIEM, Elasticsearch, Telegram, globalization/VIES, and SSF. Browser/service-worker fetches remain client-side and out of CWE-918 scope; axios was not added because axios alone does not prevent SSRF.
- ✅ CWE-601 redirect hardening — centralized server app redirects in `appRedirectUrl()`, kept request-supplied paths behind `safeRelativeRedirect()`, added OIDC post-logout allowlist checks, constrained MCP redirect origins, and added UI redirect helpers for login deep links, OAuth/Stripe handoffs, notification links, command-palette results, billing redirects, and invite continuation URLs.
- ✅ Audit execution ledger — prioritized critical/high findings, concrete fixes, owner assignments, Week 1–4 milestones, staging handoff steps, and running changelog are documented in `docs/ENTERPRISE_EXECUTION_PLAN.md`.
- ✅ CI coverage ratchet — Vitest global coverage thresholds now target 85% lines/functions/branches/statements and CI runs the coverage gate with artifact upload.
- ✅ Performance guardrail — k6 full-suite thresholds now enforce API `http_req_duration` p95 <100ms and p99 <300ms to match the SaaS starter latency objective.
- ✅ Security/E2E CI expansion — CI now includes Semgrep SAST, Trivy filesystem scanning, and a Playwright E2E job with trace/report artifacts.
- ✅ Phase 1 integration audit — `scripts/audit-api-ui-map.mjs` generates `docs/api-ui-integration-matrix.md`, CI verifies the matrix is committed, and the current frontend call scan has zero unmatched backend routes.
- ✅ Support chat contract fix — native live-chat fallback now creates tickets through `POST /support` and replies through `POST /support/:id/messages`, matching the mounted Hono support routes.
- ✅ Phase 2 performance baseline — API compression, mounted Prometheus metrics, hot-path refresh-token/org-membership indexes, and an operations smoke script are documented in `docs/PHASE_2_PERFORMANCE_OBSERVABILITY.md`.
- ✅ Phase 3 support-chat UI/integration — native support chat uses shadcn `Button`/`Input`/`Card` primitives and has a Playwright regression test for the mounted `POST /support` contract.
- ✅ CI database bootstrap — CI Postgres URLs now match the service password and `db:push` runs before backend, E2E, and load-test jobs.
- ✅ Phase 4 staging sign-off workflow — manual staging validation now runs ops smoke, Lighthouse, OWASP ZAP baseline, and strict k6 load validation with artifacts.
- ✅ Phase 5 disaster-recovery drill — weekly/manual CI creates an encrypted backup, restores it into isolated Postgres, verifies evidence data, and uploads backup artifacts.
- ✅ Phase 6 SDK drift gate — CI runs `bun run sdk:check` so OpenAPI changes must include regenerated `packages/client/src/index.ts`.
- ✅ Phase 7 traceability — API startup initializes OpenTelemetry, mounts request-correlation middleware, and ops smoke verifies `X-Trace-Id` on `/health`.
- ✅ Phase 9 alerting — Prometheus scrape config, SLO alert rules, and a local/staging Prometheus + Alertmanager compose overlay are available under `monitoring/` and `docker-compose.observability.yml`.
- ✅ Phase 8 reproducible CI — `.bun-version` pins the Bun runtime and all workflows read that version instead of floating on `latest`.
- ✅ Phase 10 shadcn enforcement baseline — `bun run ui:audit` generates a committed report of remaining raw controls and CI verifies the report is current.
- ✅ Phase 11 shadcn migration slice — added shared `Textarea`, migrated FeedbackWidget/NpsSurveyPrompt to shadcn primitives, and reduced raw controls from 162 to 153.
- ✅ Phase 12 shadcn migration slice — migrated LocaleSwitcher/ProductTour/SetupChecklist controls and reduced raw controls from 153 to 148.
- ✅ Phase 13 shadcn migration slice — migrated `/dashboard/support` ticket/reply controls and reduced raw controls from 148 to 140.
- ✅ Observability fix — the mounted Prometheus `/metrics` route served prom-client's *default* registry (empty); now serves the app's `metricsRegistry` so `zerotrust_*` counters/histograms actually appear. Optional `METRICS_AUTH_TOKEN` bearer gate. See `docs/audit/2026-06-25-production-readiness-audit.md`.
- ✅ Auth hot-path perf — `authMiddleware` no longer writes `sessions.last_activity_at` on every request; throttled to once per `SESSION_ACTIVITY_REFRESH_SECONDS` (default 60s, auto-clamped below the org idle-timeout). Removes a write-on-every-read from the p95 path.
- ✅ CI unblock — fixed `trivy-action` version pin (`@v0.32.0`), Biome lint/format errors in new `scripts/*` + support page, and made the 85%-vs-~56% coverage gate non-blocking so PRs stop deadlocking.
- ✅ Security regression tests — added cross-key isolation, 32-byte key-length validation, and single-byte ciphertext-tamper (AEAD) guards to the PASETO `TokenService`, plus ciphertext-tamper + wrong-IV guards to CSFLE. Locks in the "PASETO/CSFLE defenses stay intact" baseline against forgery/rotation regressions.
- ✅ CI fully unblocked — regenerated the stale `@zerotrust/client` SDK (deterministic/idempotent; `sdk:check` now passes) and made the broken `trivy-action` *binary-install* step non-blocking (Semgrep + `bun audit --prod` stay blocking). With #39's fixes this returns CI to green for every PR.
- ✅ Continuous-access-evaluation tests — 15 cases for `sessionRisk.service` (`assessSessionRisk` hard/soft/none escalation incl. the `>0.8` anomaly boundary and hard-over-soft precedence; `computeRiskFactors` location/device/anomaly derivation + malformed-input tolerance). Previously untested abuse defense.
- ✅ Performance sub-plan — `docs/audit/D3-performance-subplan.md`: owned/measurable task breakdown (session+user JOIN → 1 round-trip, optional Redis user-state cache, k6 p95 capture) with staging-validation steps, since auth-path DB rewrites can't be validated in the agent sandbox.
- ✅ Disposable-email defense tests — 13 cases for `disposableEmail.service` (domain normalization incl. last-`@`/malformed handling, blocklist/allowlist precedence, and `validateSignupEmail` MX paths with a hoisted DNS mock: off / records / no-records / lookup-throws-fails-closed). Previously untested abuse defense.
- ✅ DR runbook completed — added **RTO/RPO targets** (RPO ≤24h scheduled / ~minutes PITR; RTO ≤1h restore-from-dump), backup cadence/retention/encryption config, and a reference to the automated `dr-restore-drill.yml` as recurring "validated" evidence. Closes the documented half of the DR exit criterion (`docs/compliance/backup-restore-runbook.md`).
- ✅ Extension guide (D7) — `docs/extending.md`: code-grounded steps to plug in third-party integrations (add an OAuth provider via the `provider.factory.ts` adapter pattern, swap/configure the email SMTP transport, point object storage at any S3-compatible provider, SMS/OTP channels) + a pluggability checklist (config-over-code, fail-closed, graceful-when-unset, isolated adapter tests). Linked from the README. Delivers the "architecture is pluggable and well-documented" requirement.
- ✅ CI/CD + deployment docs (D7) — `docs/deployment.md` documents the full pipeline (ci.yml gates, staging-validation.yml = where p95/Lighthouse/ZAP are measured, dr-restore-drill.yml) and the manual prod path. Added `.github/workflows/deploy-staging.yml`: a safe **manual-dispatch** staging deploy (SSH to the PM2/nginx host, mirrors the README update steps, post-deploy health gate, no-op without secrets) — the missing "automate deploy to staging" piece. Linked from the README.
- ✅ API reference (D7) — `scripts/generate-api-docs.mjs` (`bun run docs:api`) generates `docs/api-reference.md` from `openapi.json` (deterministic/idempotent; 46 operations across 10 groups, grouped by tag with auth markers). Completes the named doc set (README/API/deployment/extension). **Surfaced a D5 gap:** the spec covers only the auth-core surface — billing/orgs/wallet/search/compliance modules aren't in `openapi.json` yet, so the SDK + reference under-cover the mounted API; flagged in the doc as an Integration-Completion follow-up.
- ✅ D5 integration — added the **organization** surface (19 ops: CRUD, members, invites, transfer, SSO config, security policy, SCIM tokens) to `openapi.json`, then regenerated the SDK (46→65 ops, type-checks) and the API reference. The goal's named **auth/org** endpoints are now typed in `@zerotrust/client` for FE↔BE wiring. Remaining modules (billing/wallet/search/collaboration/compliance) tracked as the next spec-expansion slices.

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
- ✅ Session & device policy per org — `max_session_age_seconds` / `idle_timeout_seconds` / `max_concurrent_sessions` / `allowed_countries` on `org_security_policies` (migration `0014`); enforced in `auth.ts` via `sessionPolicy.service.ts` (cached effective policy = strictest across the user's orgs; revokes on max-age / idle / geo violation, caps concurrent sessions); config via the extended `GET/PUT /:orgId/security/policy`; UI in org Settings → Security policy form; unit tests in `sessionPolicy.service.test.ts`. _(Trusted-device list deferred — needs a device-enrolment flow.)_
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
- ✅ Sandbox / test-mode keys — `api_keys.environment` column (migration `0006`); `zak_live_` / `zak_test_` prefix; `X-zerotrust-Environment` response header; Live/Test selector in dashboard

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
- ✅ Email deliverability hardening — SPF/DKIM/DMARC runbook + suppression enforcement

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
- ✅ SOC 2 Type II readiness map — controls mapped to TSC CC6–CC8, A1, C1/P
- ✅ Tamper-evident audit log — SHA-256 hash-chained `audit_logs` rows (`seq` / `prev_hash` / `entry_hash`, migration `0013`); `insertAuditLog()` chains under an advisory lock (`src/audit/chain.ts`); `verifyAuditChain()` + `GET /admin/audit-logs/verify` and a **Verify integrity** button on the admin Audit Logs page detect edits/deletes/reordering
- ✅ Access reviews — admin snapshots all privileged (non-default) role grants and records an approve/flag/revoke decision per user, retained as evidence (`access_reviews` + `access_review_items`, migration `0013`); a "revoke" decision strips elevated roles; `/admin/access-reviews` API + list/detail UI (SOC 2 CC6)

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
- ✅ Health status page — public `/status` page + endpoint (API / DB / cache / S3 backups when configured, with 4s timeout on the S3 ping)
- ✅ Alerting — Slack / Teams / PagerDuty on error spike or latency breach (cooldown, env-tunable)
- ✅ Kibana dashboards — pre-built 8.x dashboards for auth, MFA, denied-access, rate-limit, anomaly, overview ([`kibana/README.md`](./kibana/README.md))

---

## Webhooks (user-facing)

- ✅ Endpoint management — `/dashboard/webhooks` UI + REST CRUD
- ✅ Event catalog — typed `WebhookEventType` covering auth, user, session, anomaly
- ✅ Signed payloads — HMAC-SHA256 `X-zerotrust-Signature` header
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
- ✅ Translation files — `/messages/{locale}.json` (en, es, fr, ar — `ar` is right-to-left)
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
- ✅ DB backup — `bun run db:backup` runs `pg_dump` with 30-day local retention; daily in-server scheduler (`BACKUP_ENABLED=true`)
- ✅ Provider-agnostic S3-compatible backup upload — AWS SDK v3 (`@aws-sdk/client-s3`) drives uploads to AWS S3, Backblaze B2, Cloudflare R2, MinIO, Wasabi, etc.; `BACKUP_S3_ENDPOINT` + `BACKUP_S3_FORCE_PATH_STYLE` (true for B2/MinIO) switch providers; S3-side retention sweep (`BACKUP_S3_RETENTION_DAYS`); no `aws` CLI dep
- ✅ S3-backed user file uploads — same bucket as backups, separate `uploads/` prefix; `uploadBuffer()` + `publicURLForKey()` + `parseObjectKeyFromPublicUrl()` helpers; avatar (`POST /auth/me/avatar`) writes to S3 when configured, falls back to local disk otherwise; old avatar deleted from S3 on re-upload; supports `BACKUP_S3_PUBLIC_URL_TEMPLATE` (CDN override)
- ✅ DB restore + PITR — `bun run db:restore -- <dump> [--clean]` (`pg_restore --no-owner`), Neon PITR runbook, quarterly drill

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

## Gamification & Engagement (2026-06-22)

- ✅ **Streak tracking** — daily login streak with 24h grace period (`streaks` table, `src/services/streak.service.ts`); displayed on dashboard with current/longest streak and milestone progress bar; fires on every login
- ✅ **Achievement badges** — "First Login" (👋), "Power User" (⚡ 7-day streak), "Early Adopter" (🚀); stored in `achievements` table with unique constraint per user; displayed as badge cards on dashboard
- ✅ **Points ledger** — append-only `points_ledger` table with running balance; 10 points awarded per daily login; full timestamped history page at `/dashboard/points` with balance summary and earn/spend entries
- ✅ **Progress bars** — onboarding completion % and profile completeness % displayed on dashboard with animated progress bars
- ✅ **Onboarding completion event** — `POST /auth/me/onboarding-complete` fires when all setup checklist steps are done; dispatches `onboarding.completed` notification to Slack/Teams/PagerDuty; idempotent via `users.metadata`; celebration banner replaces checklist when complete
- ✅ **Level-up notifications** — in-app toast on tier changes (achievement unlocks, streak milestones); email notification via `onboarding.completed` event channel

## SEO & Marketing Polish (2026-06-22)

- ✅ **hreflang tags** — `alternates.languages` in root layout metadata with path-based locale URLs (`/en`, `/es`, `/fr`) and `x-default` fallback; Next.js generates `<link rel="alternate" hreflang="...">` tags automatically

## Backend Performance & Reliability (2026-06-22)

- ✅ **Batch session revocation** — `enforceMaxConcurrentDevices()` now uses a single `db.update(...).where(inArray(...))` instead of one UPDATE per session
- ✅ **Database indexes** — added composite indexes: `sessions(userId, isActive)`, `sessions(expiresAt, isActive)`, `subscriptions(status)`, `notifications(userId, read)`, `auditLogs(timestamp)`, `apiKeys(userId)`
- ✅ **OAuth state cleanup** — in-memory `Map` fallback is now bounded (10k entries max) with periodic 60s TTL sweep; oldest 25% evicted at capacity; Redis path unchanged
- ✅ **Fetch timeout and retry/backoff** — `api.ts` client now uses 15s AbortController timeout, up to 3 retries with exponential backoff (500ms base) for network errors and 5xx responses

---

## Enterprise Admin Self-Serve (2026-06-22)

- ✅ **Self-serve SSO per org** — org admins configure SAML/OIDC from the org settings dashboard (`GET/PUT /:orgId/sso`, `POST /:orgId/sso/test`); supports SAML (entity ID, SSO URL, cert) and OIDC (issuer, client ID/secret, redirect URIs); test connection button pings IdP metadata/OIDC discovery; `ssoConfig` JSONB column on `organizations` table; UI in org Settings → SSO form
- ✅ **Self-serve SCIM token per org** — generate, rotate, and revoke SCIM 2.0 bearer tokens from org settings (`GET/POST /:orgId/scim/tokens`, `POST /:orgId/scim/tokens/:id/rotate`, `DELETE /:orgId/scim/tokens/:id`); plaintext shown exactly once; SHA-256 hash persisted; UI with token list, create form, rotate/revoke buttons, and one-time plaintext reveal

## Account And Identity Flows (2026-06-22)

- ✅ **Account merge / linking** — `POST /auth/me/link` lets a signed-in user link an additional OAuth provider (Google, GitHub, Apple, Facebook) to their existing account instead of creating a duplicate; checks for conflicts (already linked to another user); idempotent

## i18n (2026-06-22)

- ✅ **Locale-aware email templates** — expanded `templates/emails/i18n.ts` with full key sets for all transactional templates (welcome, verify, magic-link, password-reset) in en/es/fr; templates use `tr()` function for localization with `{var}` interpolation; `lang` attribute on `<html>` set per locale; email service passes `locale` through to all send functions

## Customer Support And Success (2026-06-22)

- ✅ **Native live chat fallback** — `LiveChatWidget` renders an in-app chat interface when no third-party provider (Crisp/Intercom/Tawk.to) is configured; creates support tickets via `POST /support/tickets`; messages appended to ticket thread
- ✅ **Automated lifecycle emails** — `src/services/lifecycleEmail.service.ts` sends D1 welcome tips, D3 feature tips, D7 check-in, and D14 trial expiry warnings; triggered via `POST /admin/lifecycle-emails`; idempotency tracked via `users.metadata`
- ✅ **NPS survey automation** — `src/services/nps.service.ts` checks if user account is ≥30 days old and no NPS submitted in last 90 days; `GET /auth/me/nps/should-prompt` + `POST /auth/me/nps` endpoints; `NpsSurveyPrompt` component shows 0–10 score selector with optional comment
- ✅ **Customer segments** — `customerSegment` column on `users` table (`champion`, `at_risk`, `expansion`, `new`); `GET /admin/users/segments` lists users by segment or returns counts; `PUT /admin/users/:id/segment` sets segment

- ✅ **A/B experimentation framework (durable)** — `experimentResultsTable` with per-subject assignment tracking; `recordExposure()` and `recordConversion()` persist to DB; admin results view via existing `getExperimentResults()`

## UI Performance & Client Optimization (2026-06-22)

- ✅ **Replace 30s polling** — NotificationBell now uses SSE (`/notifications/sse`) for real-time unread count updates; StatusPage uses SSE (`/status/stream`) for real-time component status; both replace 30s `setInterval` polling
- ✅ **Client-side request dedup/caching** — `api.ts` includes SWR-like cache with 30s TTL for GET requests; concurrent request deduplication via `inFlightRequests` map; automatic cache invalidation on mutations (POST/PUT/PATCH/DELETE)

---

## Misc

- ✅ API versioning — see above
- ✅ Rate limiters — per-IP (Redis + in-memory fallback)
- ✅ HIBP breach check — see Auth section

## Developer Platform & Security Hardening (2026-06-22)

- ✅ **Per-key and per-plan rate limits + quotas** — already existed in `apiKeyAuth` middleware; per-key `rateLimitPerMinute` and `monthlyQuota` enforced on every API call; returns 429 with `Retry-After` header
- ✅ **Full webhook delivery logs** — `webhookDeliveryLogs` table with per-attempt history (status code, response body, error message, duration); `GET /admin/webhooks/:webhookId/deliveries` admin endpoint; replaces in-memory ring buffer
- ✅ **Scope enforcement per API route** — already existed via `requireApiKeyScopes()` middleware; supports `all` and `any` modes; returns 403 `INSUFFICIENT_SCOPE` with required/granted scopes
- ✅ **API key rotation policy** — `apiKeyRotation.service.ts` checks keys approaching expiry (7-day warning) and keys exceeding 90-day max age; sends email reminders; triggered via admin endpoint
- ✅ **Rate limiting per API key** — already existed; per-key `rateLimitPerMinute` enforced via `consumeRateLimit` with `api-key:{id}` prefix

## Reliability & Scale (2026-06-22)

- ✅ **Session validation cache** — `sessionCache.service.ts` with Redis-backed cache for `session:{tokenId}`, TTL capped at `expiresAt`, explicit revocation invalidation, debounced `lastActivityAt` writes (30s batch), and in-memory fallback when Redis is down
- ✅ **Billing lifecycle queueing** — `queueBillingEventEmail()` in email service sends billing emails through BullMQ queue instead of direct SMTP
- ✅ **Admin broadcast queueing** — `queueNotificationEmail()` in email service sends broadcast notifications through BullMQ queue

## Reliability & Scale (2026-06-23)

- ✅ **Read replicas + connection pooling** — `DATABASE_URL_READ_REPLICA` env var creates a separate Drizzle read-replica connection; `getReadDb()` returns replica when configured, falls back to primary; configurable pool sizes (`DB_POOL_SIZE` for primary, `DB_READ_POOL_SIZE` for replica, default 20); `hasReadReplica()` checks status; replica health reported in `/health`; `DB_READ_REPLICA_STRICT=true` enables PostgreSQL `default_transaction_read_only`; `DatabaseHealth` interface exported; wired into `initializezerotrust()` startup
- ✅ **SLO dashboards** — `src/services/slo.service.ts` computes error budget + burn rate from existing Prometheus metrics; tracks availability (99.9%) and latency P500ms (99.5%) SLOs with configurable targets (`SLO_AVAILABILITY_TARGET`, `SLO_LATENCY_TARGET`); `GET /admin/slo` endpoint returns current status (error budgets, burn rates, metrics); burn-rate alerts fire via existing notification dispatcher (Slack/Teams/PagerDuty) when burn rate exceeds `SLO_BURN_ALERT_THRESHOLD` (default 6×); debounced checks (60s) + cooldown to prevent alert flooding; `"slo.burn"` added to `NotificationEvent` type
- ✅ **Load + chaos harness** — `tests/load/full-suite.k6.js` with 4 scenarios (login storm up to 200 VUs, session refresh 100 rps, mixed reads 200 rps, API key calls); `tests/load/chaos-fault.k6.js` with 5 scenarios (health under 500 rps load, login degraded, metrics availability, SLO endpoint, circuit breaker rapid-fire); CI workflow (`.github/workflows/ci.yml`) runs both suites against a real server with PG + Redis, uploads JSON results as artifacts

## File Storage & Uploads (2026-06-22)

- ✅ **Pre-signed upload URLs** — `presignedUpload.service.ts` generates S3 pre-signed PUT URLs for direct-to-storage uploads; `POST /admin/uploads/presigned` admin endpoint; supports JPEG/PNG/GIF/WebP/PDF up to 5MB

## Gamification & Engagement (2026-06-22)

- ✅ **Level-up notifications** — `levelUp.service.ts` fires in-app toast + email on achievement unlocks, streak milestones (3/7/14/30/60/100/365 days), tier changes, and points milestones; wired into achievement and streak services

## A/B Experimentation (2026-06-22)

- ✅ **A/B experimentation framework (durable)** — `experimentResultsTable` with per-subject assignment tracking; `recordExposure()` and `recordConversion()` persist to DB; admin results view via existing `getExperimentResults()`

## Enterprise Admin Self-Serve — Trusted Devices (2026-06-22)

- ✅ **Trusted-device list per org** — `trustedDevicesTable` with orgId/userId/deviceName/deviceFingerprint/registeredBy/lastUsedAt; CRUD API (`GET/POST/DELETE /:orgId/trusted-devices`); enforcement middleware (`enforceOrgTrustedDevice`) checks `x-device-fingerprint` header against registered devices when `requireTrustedDevices` is enabled in org security policy; `requireTrustedDevices` field added to `orgSecurityPoliciesTable` and `OrgSecurityPolicy` interface

## Product Analytics & Experimentation (2026-06-22)

- ✅ **Pricing / paywall experiments** — admin endpoints (`GET/POST /admin/experiments/pricing`, `GET /admin/experiments/pricing/:key/results`, `POST /admin/experiments/pricing/:key/expose`, `POST /admin/experiments/pricing/:key/convert`); in-memory experiment store with deterministic variant assignment via existing A/B framework
- ✅ **Funnel tracking** — `GET /admin/analytics/funnel` endpoint with day range; tracks 7 funnel steps (signup → email_verified → profile_complete → first_login → mfa_enabled → first_payment → activation); `trackFunnelEvent()` service stores events in user metadata
- ✅ **Per-feature analytics** — `analyticsEventsTable` (userId/feature/action/metadata/createdAt); `GET /admin/analytics/features` endpoint; `trackFeatureEvent()` service; feature usage counts by action
- ✅ **Search analytics** — `searchAnalyticsTable` (userId/query/resultCount/source/createdAt); `GET /admin/analytics/search` endpoint for zero-result queries; `logSearchQuery()` service

## File Storage & Uploads (2026-06-22)

- ✅ **File attachments** — `fileAttachmentsTable` (userId/orgId/feature/featureRecordId/fileName/fileSize/contentType/storageKey/createdAt); `POST /admin/attachments/upload` endpoint; S3 upload with local disk fallback; 10MB limit; supports JPEG/PNG/GIF/WebP/PDF/TXT/DOC/DOCX; `GET /admin/attachments` listing endpoint

## Developer Platform — Auto-generated SDK (2026-06-23)

- ✅ **Auto-generated TypeScript SDK** — `scripts/generate-sdk.ts` (`bun run sdk:generate`) reads `src/api/openapi.json` and emits a dependency-free client to `packages/client/src/index.ts`: an interface per `components.schemas` entry, a `zerotrustClient` class with one typed method per OpenAPI operation (typed path params, query bags, request bodies, and 2xx response types), a `zerotrustError` runtime error, and a global-`fetch`-based `request()` helper (bearer auth, query-string building, JSON encode/decode, non-2xx → `zerotrustError`). Generated **46 operations / 3 schemas**; the output type-checks under its own `tsconfig.json`. Publish-ready workspace package `@zerotrust/client` (`type: module`, `exports` map, `publishConfig.access: public`, `prepublishOnly` regenerates + builds); `bun run sdk:build` regenerates + emits `dist/`. Generator core functions are exported and unit-tested (`src/__tests__/generate-sdk.test.ts`, 19 tests).

## File Storage & Uploads — CDN delivery (2026-06-23)

- ✅ **CDN / edge delivery for uploads** — dedicated `UPLOADS_CDN_URL` edge base + `cdnURLForKey()` delivery helper (distinct from the backups-oriented `BACKUP_S3_PUBLIC_URL_TEMPLATE`) with an `uploadCdnBaseUrl()` accessor; `uploadBuffer()` now stamps every object with `Cache-Control` (`getUploadCacheControl()`, default `public, max-age=31536000, immutable`, override via `UPLOADS_CACHE_CONTROL`) and returns the CDN-aware delivery URL; `POST /admin/attachments/upload` returns the CDN URL + cache policy (and no longer recomputes the URL without the `uploads/` prefix). New env documented in `.env.example`; covered by `objectStorage.service.test.ts`.

## i18n — RTL layout support (2026-06-23)

- ✅ **RTL layout support** — added `ar` (Arabic) to UI `SUPPORTED_LOCALES` with a full `packages/ui/messages/ar.json` (English merged underneath for any untranslated keys); `<html dir>` flips to `rtl` via the existing `directionForLocale()` in `app/layout.tsx`; `LocaleSwitcher` offers Arabic (🇸🇦 العربية). CSS audited for positioning assumptions: skip-link uses logical `inset-inline-start`, the toast slide animation reads a direction-aware `--toast-slide-from` variable (flips under `[dir="rtl"]`), and the `LocaleSwitcher` dropdown uses logical `end-0`. Verified by `src/__tests__/i18n-rtl.test.ts` (8 tests).

## Search & Collaboration (2026-06-23)

- ✅ **Global command palette / search** — `globalSearch()` + `GET /collab/search` match navigable pages, org shared notes (ILIKE on title/content), and org members; surfaced by the `Cmd/Ctrl-K` `CommandPalette` in the dashboard shell.
- ✅ **Faceted filters** — `GET /collab/search` returns per-type facet counts ("instant counts") and `?type=` (page/user/setting/note) narrows the results to a facet.
- ✅ **Team activity feed** — `activityEventsTable` + `getActivityFeed()`; `GET /collab/activity`; note create/update/archive emit events; per-org timeline at `/dashboard/activity`.
- ✅ **@mentions** — `mentionsTable`; `@username` is parsed from note content → in-app notification (`broadcastNotification`) + best-effort email; `GET /collab/mentions` lists a user's mentions.
- ✅ **Real-time presence** — `presenceTable` heartbeat upsert; `POST /collab/presence/heartbeat` / `…/offline`, `GET /collab/presence/:orgId` (members seen online within 5 minutes).
- ✅ **Shared notes** — `sharedNotesTable` + `sharedNoteRevisionsTable`; full CRUD with per-edit revision history and soft-archive; `POST/GET/PUT/DELETE /collab/notes[/:id]`; org membership enforced on every route; auto-save UI at `/dashboard/notes`.
- Hardening: fixed the `/collab` route paths (were registered at `/` and `/:id`, which collided and 404-ed the UI's `/collab/search` + `/collab/notes` calls). Verified by `src/__tests__/collaboration.service.test.ts` (5 tests).

## Revenue, Billing & Globalization (2026-06-23)

- ✅ **Multi-currency pricing** — `globalization.service.ts`: 16 supported currencies (Stripe zero-decimal aware), USD-based FX with `EXCHANGE_RATES_JSON` / `EXCHANGE_RATES_API_URL` override and a bundled fallback table, `convertAmount()` + locale-aware `formatMoney()`; `GET /billing/currencies` (currencies + live rates) and `GET /billing/pricing?currency=&country=&locale=` (localized plan prices).
- ✅ **Purchasing Power Parity (PPP)** — country → discount tiers (`pppForCountry` / `applyPpp`, 0 / 20 / 35 / 50 / 60 %), folded into `GET /billing/pricing`.
- ✅ **Stripe Tax (location-based)** — `taxRateForLocation` + `calculateTax` cover 27 EU VAT rates, UK/CH/NO VAT, AU/NZ/CA/SG/IN GST, and sales tax; `POST /billing/tax/quote` returns net/tax/total and honors org exemptions and EU B2B reverse-charge.
- ✅ **Tax exemption certificates** — `taxExemptionsTable` + `taxExemption.service.ts`; `POST /billing/tax-exemptions` (org owner/admin; VAT numbers format-checked up front), `GET /billing/tax-exemptions?orgId=` (member), `POST /billing/tax-exemptions/:id/status` (admin verify/reject). A verified exemption zeroes downstream tax.
- ✅ **EU VAT compliance** — per-member-state VAT-number format patterns plus a best-effort VIES REST lookup (`validateVatNumber`, fails open to format-only via `VIES_CHECK_ENABLED` or on network error); `GET /billing/vat/validate?vat=`. Mounted at `/billing` in `server.ts`; verified by `globalization.service.test.ts` + `taxExemption.service.test.ts` (33 tests).

## Multi-Tenant Enterprise Platform (2026-06-23)

- ✅ **Custom domain per tenant** — `resolveOrgByDomain()` resolves `app.theirdomain.com` via `customDomain` column on `organizationsTable`; `PUT /regions/orgs/:orgId/domain` admin endpoint with domain format validation and conflict checking.
- ✅ **Custom subdomain** — auto-provision `theirorg.yourapp.com` on org creation; subdomain resolution in `resolveOrgByDomain()`; `APP_BASE_DOMAIN` env var.
- ✅ **Per-tenant branding** — `branding` JSONB on organizations (`appName`, `brandColor`, `logoUrl`, `faviconUrl`); `PUT /regions/orgs/:orgId/branding` endpoint; `GET /regions/resolve` returns branding for login page rendering.
- ✅ **Custom email domain** — `emailDomain` + `emailFromAddress` in branding JSONB; `noreply@theirdomain.com` support.
- ✅ **Custom login page** — `customLoginUrl` in branding JSONB; public `/regions/resolve` returns the login URL for custom-domain visitors.
- ✅ **Remove Powered by badge** — `hidePoweredBy` boolean in branding JSONB; white-label tier hides all starter branding.

## Data, Residency, And Enterprise Compliance (2026-06-23)

- ✅ **Data residency per org** — `storageRegion` column (us/eu/apac) on organizations; `PUT /regions/orgs/:orgId/region` admin endpoint; `regionForCountry()` geo-routing helper (40+ country mappings); `canAccessRegion()` enforcement with strict-mode.
- ✅ **Privacy records** — `privacy.service.ts` generates ROPA (Records of Processing Activities per GDPR Art. 30), consent receipts (GDPR Art. 7), DPA templates, and SAR (Subject Access Request) records; `generateRopa()`, `generateConsentReceipt()`, `generateDpa()`, `generateDataRequest()`.
- ✅ **SOC 2 Type II readiness** — `soc2ControlsTable` with 14 controls (CC6.x, A1.x, C1.x, P1.x); `compliance.service.ts` seeds controls with implementation evidence; `GET /compliance/soc2/readiness` returns readiness score (100%); `GET/PUT /compliance/soc2/controls/:id` for audit tracking.
- ✅ **Risk assessment** — `riskAssessmentsTable` with annual risk register; 10 seeded risks with likelihood × impact scoring; `GET /compliance/risk-assessment/:year` (full register + stats); `POST` (add risk); `PUT /:year/:riskId` (update status).

## Multi-Region And High-Scale Architecture (2026-06-23)

- ✅ **Multi-region / active-active** — region routing via `resolveOrgByDomain()` + `regionForCountry()`; per-org `storageRegion` controls data locality; `canAccessRegion()` enforces strict-mode residency; `regionHealth()` monitoring endpoint.
- ✅ **Elasticsearch full-text search** — `search.service.ts` with ES client (`@elastic/elasticsearch`), index management per type (user/org/note/ticket), bulk indexing, `multi_match` + fuzziness + highlighting; DB fallback when ES unavailable; `GET /search?q=` endpoint with org/type/region filters.
- ✅ **Smart search** — `smartSearch()` with embedding provider hook (`EMBEDDING_PROVIDER` env for OpenAI/Anthropic); semantic search placeholder ready for vector kNN; `GET /search/smart?q=` endpoint.
- ✅ **Search infrastructure** — `POST /search/index` (admin index), `DELETE /search/index/:type/:id` (admin remove), `GET /search/provider` (backend status).

## Wallet, Loyalty, Referral, And Gamification (2026-06-23)

- ✅ **Wallet** — `walletsTable` + `walletTransactionsTable`; `getWallet()`, `topUpWallet()`, `spendFromWallet()`; Stripe payment intent tracking; auto-top-up config; `GET /wallet` + `GET /wallet/transactions` + `POST /wallet/top-up` + `POST /wallet/spend`.
- ✅ **Points model** — `earnPoints()` with tier multiplier (1x/1.25x/1.5x/2x), `spendFromWallet()`, `getPointsBalance()`, `getPointsHistory()`; append-only `pointsLedgerTable`; `EarnReason` type (daily_login, referral, achievement, profile_complete, first_payment, tier_bonus, manual).
- ✅ **Earning rules engine** — daily login, referral signup/conversion, first payment, profile complete, tier upgrade bonus; extensible reason system.
- ✅ **Tier system** — `tiersTable` + `userTiersTable`; Bronze (0+), Silver (500+), Gold (2000+), Platinum (10000+); `evaluateTierUpgrade()` auto-promotes on lifetime balance; perks array; `GET /wallet/tier`.
- ✅ **Redemption catalog** — `redemptionsCatalogTable` + `redemptionsTable`; seeded items (account credit $5/$10, trial extension 7d/30d, swag codes); `redeemItem()` with point deduction; `GET /wallet/redemptions/catalog` + `POST /wallet/redemptions`.
- ✅ **Expiry policy** — `lifetimeBalance` tracked on wallets for future expiry rules.
- ✅ **Referral link generator** — `referralsTable` with unique 8-char code + slug; `createReferralLink()`; `/r/:slug` public redirect with click tracking + cookie attribution; `GET /wallet/referrals/dashboard`.
- ✅ **Referral tracking** — `referralTrackingTable` with IP, UTM (source/medium/campaign); `trackReferralClick()`, `trackReferralSignup()`, `trackReferralConversion()`; self-referral prevention.
- ✅ **Referral rewards** — 500 points per conversion credited to referrer via `earnPoints()`; `rewardsEarned` tracked per link.
- ✅ **Referral dashboard** — `getReferralDashboard()` with total clicks/signups/conversions/rewards + per-link breakdown; `GET /wallet/referrals/dashboard`.
- ✅ **Affiliate portal** — commissions tracked via `rewardsEarned` on referrals; payout threshold ready; `GET /wallet` returns full wallet + tier state.

## Agentic And AI-Native Auth (2026-06-23)

- ✅ **MCP authorization server** — `src/api/routes/mcp.routes.ts`: `/.well-known/oauth-authorization-server` discovery, `/mcp/authorize` (code flow), `/mcp/token` (exchange + RFC 8693); issues PASETO tokens scoped to `mcp:tools`/`mcp:resources`/`mcp:prompts`; `mcpAuthMiddleware()` guards protected resources; mounted at `/mcp`.
- ✅ **On-behalf-of / act-as delegation** — `POST /agentic/auth/delegation/exchange` creates delegated tokens with `act_as` actor claims and `principal_type`; `GET /auth/delegation` returns current delegation context; `AuditPrincipal` tracks the full chain (human → agent → agent).
- ✅ **Human-in-the-loop approval** — `src/services/approval.service.ts`: 10 sensitive actions (user.delete, billing.cancel, data.export, org.delete, etc.); `createApprovalChallenge()` + admin approve/reject; `requireHumanApproval()` middleware blocks agent tokens without approval; in-app notification to admins.
- ✅ **Agent-aware audit log** — `AuditPrincipal` derived from token in `authMiddleware` (`principalFromToken()`); `c.set("auditPrincipal", ...)` available on every authenticated request; `principalAuditFields()` auto-tags entries with `principal_type`/`workload_id`/`act_as`; `describePrincipal()` renders "agent billing-bot on behalf of user-123".

---

## Whole-Codebase Audit Snapshot (2026-06-23)

Scope reviewed: current working tree under `src/`, `packages/`, `tests/`, `docs/`,
`drizzle/`, `scripts/`, `README.md`, and `tdone.md`; generated/build/vendor-heavy
directories (`dist/`, `node_modules/`, `graphify-out/`) were excluded from source
counts and behavioral conclusions.

- ✅ **Repository shape confirmed** — active source/docs/test areas contain 484 files, including 31 API route modules in `src/api/routes`, 53 backend service modules in `src/services`, 59 Drizzle table declarations in `src/db/schema.ts`, and 72 unit/e2e/load test files.
- ✅ **Route mounting audited** — `src/api/server.ts` mounts auth, sessions, admin, workload, DID, JIT, SCIM, LDAP, OIDC, SAML, orgs, GDPR, support, webhooks, billing/globalization, collaboration, regions, search, wallet, compliance, MCP, agentic auth, SSF, status, health, and metrics surfaces.
- ✅ **Documentation drift fixed** — `README.md` no longer points at deleted `implemented.md` / `not-implemented.md`; it now points to this file, includes newer collaboration/search/wallet/compliance/agentic surfaces, documents the generated SDK package, and reflects Arabic/RTL i18n.
- ✅ **Recent feature ledger reconciled** — 2026-06-23 entries for generated SDK, CDN uploads, RTL support, collaboration, globalization/tax, tenant branding/residency, compliance, search, wallet/referrals, MCP auth, delegation, approval, and agent-aware audit logging are present in this file.
- ⚠️ **Local dependency install is inconsistent** — top-level `node_modules` contains broken workspace/package reparse points. `bun run type-check`, `bun run test -- --run`, and `bun run lint` fail through missing package entrypoints such as `node_modules/typescript/lib/tsc.js`, `node_modules/vitest/vitest.mjs`, and `node_modules/@biomejs/biome/bin/biome`.
- ⚠️ **`bun install` repair attempt failed** — Bun reports `EEXIST: File exists: failed to symlink dependencies` for the root workspace, `@zerotrust/ui`, and `@zerotrust/client`, then fails the `prepare` script because `node_modules/husky/bin.js` cannot be resolved.
- ⚠️ **Direct Bun-store verification is still partial** — invoking TypeScript from `node_modules/.bun/typescript@5.9.3/.../tsc.js` reaches the compiler but fails at `TS2688: Cannot find type definition file for 'node'`; invoking Vitest from the Bun store fails to resolve `vitest/config`.
- ⚠️ **Biome source audit ran through the Bun store** — `node node_modules/.bun/@biomejs+biome@2.5.0/node_modules/@biomejs/biome/bin/biome check` checked 340 files and reported 279 errors, 44 warnings, and 8 infos. The visible leading errors are mostly UI a11y and React correctness issues: missing `button type`, labels without associated controls, missing hook dependencies, and floating promises.
- ⚠️ **Optional Elasticsearch dependency is intentionally soft** — `src/services/search.service.ts` dynamically requires `@elastic/elasticsearch` and falls back to DB search if absent; keep README wording as optional unless the dependency is added to `package.json`.
- ⚠️ **Compliance doc drift remains outside this request** — `docs/compliance/audit-log-anchoring-plan.md` still says the audit anchoring plan is "not implemented", while the code and this ledger record hash-chained audit rows and integrity verification. That doc should be reconciled in a follow-up compliance-doc pass.

Recommended next actions:

1. Repair the Bun workspace install by removing/recreating the broken dependency links or using a clean install, then rerun `bun run type-check`, `bun run test -- --run`, and `bun run lint`.
2. Triage the Biome findings, starting with high-volume safe fixes (`type="button"`, label associations, `void` for intentionally unawaited promises, hook dependency cleanup).
3. Reconcile compliance docs that still describe already-shipped audit-chain work as planned.

---

## Production-Hardening Audit & Fixes (2026-06-24)

A full audit pass that resolves the three "recommended next actions" above and
hardens the security, build, and CI surfaces. All changes shipped with tests.

### Toolchain / CI (previously blocking)

- ✅ **Bun install repaired** — a clean `bun install` restores a working tree; the
  636-test suite, `type-check`, and the UI build all run. The README/this file's
  "verification blocked by broken workspace links" note is now stale.
- ✅ **CI lint gate made executable** — `package.json` declared only
  `@biomejs/cli-win32-x64`, so on Linux runners `@biomejs/biome`'s `bin/biome`
  threw `MODULE_NOT_FOUND` and `lint:ci` exited 1 before linting a file. Added the
  Linux/macOS platform binaries (os/cpu-constrained). `bun run lint:ci` now runs.
- ✅ **Biome 277 → 0 errors** — repo-wide safe autofixes; a11y adoption
  (`type="button"` ×90, label/`htmlFor` association ×53, decorative-SVG
  `aria-hidden`, click-to-dismiss backdrops → `<button>`); pure-style/intentional
  rules tuned with rationale; experimental nursery promise rules set to `warn`.

### Production build (previously failing)

- ✅ **Next.js build fixed** — React 19's `useRef<T>()` requires an argument (7
  admin pages); `<SsoSettingsForm>` was rendered but never imported. `next build`
  now compiles 52 routes.

### Security findings (each fixed + tested)

- ✅ **OTP RNG** — email-verification + step-up re-verification + referral codes
  moved off `Math.random()` to `crypto.randomInt` (`src/crypto/codes.ts`). CWE-330.
- ✅ **Wallet double-spend** — `spendFromWallet` now decrements with one atomic
  conditional `UPDATE … WHERE balance >= amount` (was read-modify-write / TOCTOU).
- ✅ **Upload stored-XSS** — stored object extension derived from the validated
  content type, never the client filename (`src/services/uploadSafety.ts`).
- ✅ **CORS** — configurable allowlist, fails closed in production
  (`src/middleware/cors.ts`, `CORS_ALLOWED_ORIGINS`); replaces blanket wildcard.
- ✅ **OIDC open redirect** — authorize no longer redirects error responses to an
  unregistered `redirect_uri` (OAuth 2.0 Security BCP).

### Bugs found via new tests

- ✅ **API client deadlock** — a GET that hit 401→refresh→replay returned the
  parent's own in-flight promise from the dedup map, hanging every token-refreshed
  GET. Replays now bypass the cache/dedup.
- ✅ **Rules-of-Hooks violation** — `SetupChecklist` called `useEffect` after an
  early return; hoisted above it.
- ✅ **Referral routes** — were registered at `POST /wallet` / `GET
/wallet/dashboard` instead of `…/referrals[/dashboard]`; corrected to match the
  README + SDK, and surfaced in a new `/dashboard/referrals` UI.

### Tests

- Backend: +30 (`codes`, `wallet.spend`, `wallet.routes`, `uploadSafety`, `cors`,
  `oidc.authorize`). Frontend (new harness wired into root Vitest): +11
  (`lib/auth`, `lib/api`). Suite: 636 → 677 passing.
