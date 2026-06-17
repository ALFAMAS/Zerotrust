# ZeroAuth — Roadmap

This roadmap has two parts:

1. **Core roadmap** — carried over from [`STARTER.md`](./STARTER.md). This is the
   authoritative, prioritized backlog (P0 → P3) and reflects what is shipped vs.
   pending today.
2. **New initiatives (brainstorm, 2026-06)** — forward-looking epics added after a
   code-graph pass over the repo (`graphify-out/`). The graph surfaced a set of
   **already-built-but-undocumented** capabilities, which directly informed the new
   ideas below.

**Legend:** `[x]` shipped · `[~]` partially shipped · `[ ]` pending · 🆕 net-new
idea (not in `STARTER.md`) · ⚡ backend exists, needs surfacing/finishing.

Priority bands: **P0** before launch · **P1** first month · **P2** first quarter ·
**P3** differentiation.

---

## Latest context (2026-06-16)

Shipped the **PWA & Mobile** P2 epic plus the adjacent onboarding/i18n items:

- **Offline support** — `public/sw.js` precaches the app shell, falls back to a
  branded `offline.html` for failed navigations, and queues mutating API requests
  in IndexedDB (`lib/offlineQueue.ts`), replaying them through Background Sync on
  reconnect. `lib/api.ts` enqueues writes on network failure and throws a typed
  `OfflineQueuedError`. SW is registered (production only) by `ServiceWorkerRegistrar`.
- **Web push** — new `push_subscriptions` table (migration `0005`),
  `services/webPush.service.ts` (VAPID via `web-push`), and
  `/notifications/push/{public-key,subscribe,unsubscribe}`. `broadcastNotification`
  now fans out to push (works when the PWA is closed) in addition to SSE + email.
  Per-device opt-in lives on the new `/dashboard/notifications` page.
- **Deep linking** — manifest gains `scope`/`launch_handler`/`shortcuts`; existing
  invite + magic-link flows already preserve `next`/`redirect`, so they resolve in
  both browser and installed-PWA contexts.
- **Product tour** — dependency-free first-login spotlight (`ProductTour.tsx`).
- **Locale-aware formatting** — `lib/format.ts` + `useFormat()` over `Intl.*`.

VAPID keys are optional: with them unset push degrades to a no-op and the rest of
the notification pipeline is unaffected.

---

## Latest context (2026-06-15)

Session focused on closing **frontend ↔ backend wiring gaps** surfaced while testing
the dashboard:

- **Dashboard auth guard** — `/dashboard/*` now redirects signed-out users to `/login`
  (mirrors the admin guard). Previously the shell rendered after sign-out because only
  the API calls 401'd, leaving a broken "logged-in" layout. Also reacts to cross-tab
  token clears via the `storage` event.
- **Silent token refresh** — the API client (`packages/ui/src/lib/api.ts`) now replays a
  single 401 through `POST /auth/token/refresh` and, on failure, bounces to
  `/login?next=…`. This is the first time the refresh-token endpoint is wired into the UI.
- **GDPR self-serve wired** — the data-export / account-deletion page (`/dashboard/account`)
  and Connected-Apps page (`/dashboard/settings`) existed but were **unreachable** (missing
  from nav) and the export/delete calls used cookie auth against Bearer-protected routes.
  Both pages are now linked in the dashboard nav and use the access token.
- **Disposable-email blocking** confirmed shipped (see 2.3) — roadmap status corrected.

Follow-up pass (same day): the four advanced backends that were mounted with **no UI**
now have admin/dashboard surfaces — see §2.0/§2.1 for status:

- **DID** → `/admin/did` (resolve + proof-of-control challenge)
- **Cross-tenant JIT** → `/dashboard/jit` (request) + `/admin/jit` (approval inbox)
- **Workload/agent identity** → `/admin/workload` (issue credential + mint agent token)
- **Federation (RFC 8693)** → `/admin/federation` (trusted-provider registry)

Same-day shell refactor: the dashboard and admin areas now share one **responsive app
shell** (`components/app-shell/` — `AppShell` + `AppSidebar` + `AppTopbar` + `AppFooter`).
The dashboard's cramped 11-item horizontal navbar is replaced by a collapsible sidebar
(slide-over drawer on mobile), every authenticated page gets a sticky topbar + footer, and
workload credentials are now listable/revocable from `/admin/workload`.

---

## Part 1 — Core roadmap (from STARTER.md)

### P0 — Launch blockers

**Infrastructure**

- [x] DB backup — `bun run db:backup` (pg_dump, 30-day retention, optional S3, daily scheduler)
- [x] Environment parity — `.env.staging.example` mirrors production shape
- [x] Health status page — public `/status` page + `GET /status` endpoint

**Security**

- [x] HaveIBeenPwned check — HIBP k-anonymity on register / reset, fails open
- [x] Login notification email — new-device alert with one-click revoke link
- [x] Account takeover detection — sensitive-change window revokes sessions + alerts both emails

**Billing**

- [x] Per-org billing — one Stripe subscription per organization
- [x] Trial period — 14-day trial with warning + upgrade emails

### P1 — Core growth

**Billing & Revenue**

- [x] Upgrade/downgrade flows (Stripe proration)
- [x] Usage counters — API calls metered, seats live-counted, `GET /billing/usage`
- [x] Dunning management — D3 / D7 / D14 escalation
- [x] Cancellation flow — survey, pause option, retention coupon
- [x] Win-back campaign — D7 / D30 / D90 emails

**Admin**

- [x] Impersonate user (30-min audited session)
- [x] Manual plan override
- [x] Revenue dashboard — MRR, ARR, churn, past-due, trials
- [x] Broadcast email to segments

**Observability**

- [x] Distributed tracing viewer — Jaeger via `docker-compose.tracing.yml`
- [x] Alerting — Slack / Teams / PagerDuty on error-spike / latency breach

### P2 — Quality & scale

**Developer Experience**

- [x] User-facing webhooks — UI, HMAC-SHA256 signing, retry/backoff, test ping
- [x] Upgrade prompt component (modal + banner)
- [x] Feature flag management UI — global toggle, per-user force, % rollout
- [x] CSV export — users + audit logs

**PWA & Mobile**

- [x] Offline support — service worker (`public/sw.js`) precaches the app shell,
  serves a branded `offline.html` for navigations, and queues mutating API calls
  in IndexedDB, replaying them via Background Sync (with an `online`-event fallback)
  on reconnect. Registered via `ServiceWorkerRegistrar` (production only).
- [x] Deep linking — invite (`/invite/:token`) + magic-link (`/magic-link/verify`)
  preserve `next`/`redirect` and open inside the installed PWA via manifest
  `scope: "/"` + `launch_handler: navigate-existing`.
- [x] Web push notifications — service worker `push`/`notificationclick` handlers,
  VAPID-backed `webPush.service.ts`, durable `push_subscriptions` table (migration
  `0005`), and `/notifications/push/{public-key,subscribe,unsubscribe}`. Wired into
  `broadcastNotification` so push fires even when the PWA is closed; per-device
  opt-in toggle on `/dashboard/notifications`. No-ops gracefully when VAPID keys
  are unset (SSE + email fallback unaffected).

**Onboarding & UX**

- [x] Empty states — shared `EmptyState` component
- [x] Product tour — dependency-free first-login spotlight walkthrough
  (`ProductTour.tsx`) anchored to `[data-tour]` nav items, persisted in
  localStorage under a versioned key; mounted in the dashboard shell.
- [x] Welcome email on registration

**i18n Completeness**

- [x] Locale-aware formatting — `lib/format.ts` wraps `Intl.DateTimeFormat` /
  `NumberFormat` / `RelativeTimeFormat` and a `useFormat()` hook bound to the active
  next-intl locale; `NotificationBell` timestamps now localize through it.
- [~] Locale-aware email templates — `users.locale` (migration `0007`) captured from
  `Accept-Language` at register and editable via `PATCH /auth/me`; `LocaleSwitcher` persists it
  server-side. Email copy is sourced from a per-locale dictionary (`templates/emails/i18n.ts`,
  en/es/fr) with English fallback. Welcome + verify-email are fully localized; remaining
  templates can adopt the same `tr()` mechanism incrementally.
- [ ] RTL layout support — _deferred: all configured locales (en/es/fr) are LTR; revisit when an
  RTL locale (ar/he) is added._
- [x] Missing-translation fallback to English

**Customer Support**

- [x] Live chat widget — Crisp / Intercom / Tawk.to.
  _2026-06-18: config-driven `LiveChatWidget` mounted in the dashboard shell; provider +
  id via `NEXT_PUBLIC_CHAT_PROVIDER` / `NEXT_PUBLIC_CHAT_ID`. Injects the chosen provider's
  script and passes the signed-in user's name/email for agent context. Unset = graceful no-op._
- [x] Support ticket model — self-hosted threaded tickets (no third-party tool).
  _2026-06-18: `support_tickets` + `support_ticket_messages` tables (migration `0008`);
  `/support` routes — open ticket, list (owner-scoped; agents get `?all=true`), view thread,
  reply (agent reply → `pending`, user reply → `open`), and status change (owners close/reopen,
  agents any). Dashboard page at `/dashboard/support` (create + list + thread). Agent role:
  `admin` or `support`._

### P3 — Differentiation

> Full P3 catalog (revenue expansion, white-labeling, integrations, loyalty,
> mobile, analytics, collaboration) is preserved in
> [`STARTER.md`](./STARTER.md#p3--differentiation). The highest-leverage P3 items
> are pulled forward into Part 2 where the code already has a head start.

---

## Part 2 — New initiatives (brainstorm, 2026-06)

### 2.0 — Surface what's already built ⚡

The code-graph pass (`graphify-out/GRAPH_REPORT.md`) found shipped subsystems that
**never made it into the feature list or docs**. Documenting and exposing these is
the cheapest, highest-impact work available — the engineering is largely done.

- ⚡ [x] **Decentralized Identifiers (DID)** — `resolveDID()`, `resolveDIDWeb()`,
  `resolveDIDKey()`, base58 codec already exist (`Did Module`). Document the
  resolver, add `did:web` support for orgs, and expose a verify endpoint.
  _2026-06-15: router mounted at `/auth/did` — `GET /resolve`, `POST /challenge`,
  `POST /verify` (proof-of-control)._
  _2026-06-15 (UI): admin tool at `/admin/did` — resolve a `did:key`/`did:web` to its
  document and generate a proof-of-control challenge. Login-via-DID still deferred:
  `provisionDIDUser()` is a stub and the users table has no `did` column — needs a
  schema migration + Drizzle-backed upsert first._
- ⚡ [ ] **Post-quantum crypto** — hybrid KEM is implemented (`createKEMProvider()`,
  `generatePQKeyPair()`, `establishPQSessionKey()`, `hybridEncrypt/Decrypt` in
  `Crypto Post`). Productize: PQ-protected token/session option behind a flag,
  document the threat model, add a "crypto agility" config switch.
- ⚡ [~] **Token exchange / identity federation (RFC 8693)** — `exchangeToken()`,
  `initFederationFromEnv()`, `listProviders()` exist (`Federation & Token Exchange`).
  Surface a federation admin UI and document the on-behalf-of / impersonation flows.
  _2026-06-15 (UI): admin provider registry at `/admin/federation` — list / register /
  remove trusted providers backing `POST /federation/token-exchange`._
  _2026-06-15 (durable): the in-memory provider Map is replaced by the
  `federated_providers` table (migration `0003`, upsert on provider id). Providers
  registered via the admin UI now persist across restarts; `initFederationFromEnv()`
  reconciles env-declared providers on boot without clobbering UI-added ones. On-behalf-of /
  "act-as" actor-claim flow still to be documented (see 2.1)._
- ⚡ [ ] **FIDO attestation & MDS3** — `AttestationPolicy`, `AttestationType`,
  `KNOWN_HARDWARE_KEY_AAGUIDS`, MDS3 verification, CA-pin store all exist
  (`Mfa Attestation`). Expose as an **org-level passkey policy** ("hardware keys only",
  "require attestation").
- ⚡ [x] **Cross-tenant JIT access** — `requestCrossTenantAccess()`,
  `CrossTenantJITStore` exist (`Jit Cross`). Build the approval-inbox UI and audit view.
  _2026-06-15: router mounted at `/jit/cross-tenant` — request/list/status + admin
  approve/deny/incoming with role guards._
  _2026-06-15 (UI): requester page at `/dashboard/jit` (submit + track requests) and
  admin approval inbox at `/admin/jit` (approve/deny + history)._
  _2026-06-15 (durable): the in-memory store is replaced by the
  `cross_tenant_jit_requests` table (migration `0003`). Requests, approvals and grants
  now survive restarts and form a queryable audit trail; expiry is computed read-time
  (an approved grant past its TTL reads as `expired`)._
- ⚡ [ ] **CSFLE field encryption** — `CSFLEManager`, key versioning, encrypt/decrypt
  plugin exist (`Crypto Csfle`). Document which fields are encrypted and add a
  key-rotation runbook.

### 2.1 — Agentic & AI-native auth 🆕 (P1–P2)

The frontier for an auth platform in 2026. ZeroAuth already has an OIDC provider,
RFC 8693 token exchange, and scoped API keys — the foundation is in place.

- 🆕 [~] **Agent / workload identity** — issue short-lived, narrowly-scoped tokens to
  AI agents and services (client-credentials + token exchange). Distinguish agent
  principals from human users.
  _2026-06-15: `/workload` routes exist (`issue` gated by `WORKLOAD_ISSUE_KEY`,
  `validate`, `token`). Tokens carry a `principal_type: agent` + `workload_id` claim._
  _2026-06-15 (UI): admin tool at `/admin/workload` — issue a credential (secret shown
  once) and mint an agent token._
  _2026-06-15 (durable mgmt): added `GET /workload/credentials` + `POST
  /workload/credentials/:id/revoke` (admin-only, secrets never returned, derived
  active/expired/revoked status). The admin UI now lists every issued credential and
  revokes it in place — closing the no-list/no-revoke gap._
- 🆕 [ ] **MCP authorization server** — implement the MCP auth spec on top of the
  existing OIDC provider so MCP clients can obtain scoped tokens.
- 🆕 [ ] **On-behalf-of / "act-as" delegation** — actor claims via the existing
  `exchangeToken()`, so an agent acts for a user with a verifiable delegation chain.
- 🆕 [ ] **Human-in-the-loop approval** — reuse continuous-verification challenges to
  require a human approval step before an agent performs sensitive actions.
- 🆕 [~] **Agent-aware audit log** — tag every audit event as human vs. agent and
  record the delegation chain.
  _2026-06-18: `shared/principal.ts` derives an `AuditPrincipal` (human/agent + `workload_id`
  + `act_as` delegation chain) from token claims; `auditLog()` now tags every entry with
  `principal_type` (defaults to human, so existing call sites are unchanged) and the workload
  agent-token mint logs with an agent principal. Remaining call sites can pass a principal
  incrementally; full coverage + the act-as exchange flow still to be wired._

### 2.2 — Self-serve enterprise (close the SSO gap) 🆕 (P1)

Today SAML/OIDC/SCIM are env-driven (one IdP per deployment). Making them
**per-org and self-serve** is the single biggest enterprise-revenue unlock.

- 🆕 [ ] **Self-serve SSO per org** — org admins configure SAML/OIDC from the
  dashboard; metadata upload + test connection, no redeploy.
- 🆕 [ ] **Self-serve SCIM token per org** — generate/rotate a SCIM bearer token in
  the org settings UI.
- ⚡ [ ] **Org passkey policy** — drive the existing MDS3 attestation engine from an
  org-level toggle.
- 🆕 [ ] **Session & device policy per org** — max session age, idle timeout,
  concurrent-session cap, trusted-device list, geo/IP rules.
- 🆕 [x] **IP allowlist per org** — restrict API + dashboard to CIDR ranges
  (pulled forward from P3).
  _2026-06-18: `org_security_policies.ip_allowlist` (IPv4 CIDRs, migration `0009`); a router
  middleware enforces it on every `/:orgId` org-scoped request (UUID-guarded so literal paths
  aren't mis-matched). Shared `shared/cidr.ts` matcher (also now backs global geofencing).
  Managed from the org Settings → Security policy form; empty = no restriction._

### 2.3 — Trust, safety & abuse prevention 🆕 (P1–P2)

Builds on HIBP + lockout + anomaly detection + device fingerprinting already shipped.

- 🆕 [x] **Disposable-email blocking** — reject throwaway domains + optional MX validation on
  register (`disposableEmail.service.ts`, wired into `POST /register`). Block/allow lists are
  env-driven (`DISPOSABLE_EMAIL_BLOCKLIST` / `_ALLOWLIST`); set `DISPOSABLE_EMAIL_VALIDATE_MX=true`
  to also require a resolvable MX record.
- 🆕 [x] **Bot / abuse signals** — proof-of-work or CAPTCHA fallback on suspicious signups.
  _2026-06-18: stateless hashcash-style PoW (`services/proofOfWork.service.ts`) — signed,
  self-expiring challenge; client finds a sha256 preimage with N leading zero bits.
  `GET /auth/pow/challenge` issues it (returns `{enabled:false}` when off) and `POST /register`
  verifies it. Browser solver in `lib/pow.ts` wired into the register page. Off by default
  (`SIGNUP_POW_ENABLED`); difficulty/TTL env-tunable._
- 🆕 [x] **Credential-stuffing defense** — IP reputation + global velocity limits layered
  on the per-IP rate limiter.
  _2026-06-18: `middleware/credentialStuffing.ts` tracks login failures per source IP in a
  sliding window and blocks the IP (429 `TOO_MANY_ATTEMPTS`) once it crosses a raw
  failure-velocity OR distinct-accounts-targeted threshold (the strong stuffing signal) —
  complementing the per-account lockout. Wired into `POST /auth/login`; thresholds are
  env-tunable (`CRED_STUFF_*`)._
- 🆕 [x] **Email deliverability hardening** — SPF/DKIM/DMARC setup guide, bounce/complaint
  webhooks, suppression list (protects sender reputation for the BullMQ queue).
  _2026-06-18: `email_suppressions` table (migration `0011`) + `emailSuppression.service.ts`;
  the central `sendEmail()` skips suppressed recipients (fails open). Provider-agnostic
  bounce/complaint webhook `POST /webhooks/email/event` (optional `EMAIL_WEBHOOK_SECRET`).
  SPF/DKIM/DMARC + suppression runbook in [`docs/email-deliverability.md`](./docs/email-deliverability.md)._
- 🆕 [ ] **Account merge / linking** — link an OAuth identity to an existing email account
  instead of creating a duplicate.

### 2.4 — Developer platform 🆕 (P2)

OpenAPI spec already exists (`Api Openapi` community) — leverage it.

- 🆕 [ ] **Auto-generated SDKs** — TS + Python clients from the OpenAPI spec, published to npm/PyPI.
- 🆕 [x] **Sandbox / test-mode keys** — separate live vs. test API keys, mirroring Stripe.
  _2026-06-18: `api_keys.environment` column (migration `0006`); `POST /api-keys` accepts
  `environment: live|test` and prefixes the secret `zak_live_`/`zak_test_`; `apiKeyAuth`
  sets `c.var.apiKeyEnvironment` + an `X-ZeroAuth-Environment` response header so handlers
  can route test traffic to sandbox data. Dashboard key creator has a Live/Test selector and
  the list flags test keys with a badge._
- 🆕 [ ] **Per-key & per-plan rate limits + quotas** — extend rate limiting and usage metering.
- [~] **Webhook delivery logs UI** — per-attempt history surfaced in the dashboard.
  _2026-06-18: `webhookDeliveryLog` records every attempt (initial/retry/ping) in a bounded
  in-memory ring buffer (`src/webhooks/deliveryLog.ts`); `GET /webhooks/:id/deliveries` returns
  the history (secrets/response bodies omitted) and the dashboard webhooks page has a
  "Deliveries" viewer. Full Postgres durability is deferred until the whole webhook subsystem
  (endpoints are still in-memory) is persisted._
- 🆕 [x] **API versioning** — version prefix + deprecation headers + sunset policy.
  _2026-06-18: `middleware/apiVersioning.ts` — clients select via `X-API-Version` header or
  `/vN` path prefix; a version registry tracks current/deprecated/sunset + sunset dates.
  Deprecated versions get RFC 8594 `Deprecation`/`Sunset`/`Link` (successor) headers; sunset
  (or past-sunset) versions get 410. `GET /api/versions` exposes the registry. Routes aren't
  physically split yet — this establishes the negotiation + lifecycle contract._

### 2.5 — Compliance, data & residency 🆕 (P2–P3)

Audit log already streams to Elasticsearch — extend the pipeline.

- 🆕 [x] **SIEM streaming** — fan out audit events to Datadog / Splunk / S3.
  _2026-06-18: `services/siem.service.ts` — generic HTTP sink (Datadog HTTP intake, Splunk HEC,
  S3 proxy, any JSON collector); `auditLog()` fans every event out to it (fire-and-forget,
  never throws/blocks). Off by default; configured via `SIEM_*` env._
- 🆕 [ ] **Tamper-evident audit log** — hash-chain / Merkle anchoring for legal defensibility.
- 🆕 [ ] **Data residency per org** — EU / US / APAC storage region (pulled forward from P3).
- 🆕 [ ] **Privacy records** — ROPA, consent receipts, auto-generated DPA.
- 🆕 [x] **Legal hold** — override retention auto-purge for accounts under hold.
  _2026-06-18: `users.legal_hold` (+reason/at, migration `0010`); `legalHold.service.ts`
  (`setLegalHold` / `getHeldUserIds`, defensive). `purgeOldAuditLogs` excludes held users'
  audit logs (`notInArray`) so their trail is preserved. Admin `POST
  /admin/users/:id/legal-hold` places/lifts a hold (audited)._
- [~] **SOC 2 Type II readiness** — access-control evidence, change mgmt, incident response.
  _2026-06-18: [`docs/soc2-readiness.md`](./docs/soc2-readiness.md) maps existing controls to the
  Trust Services Criteria (CC6–CC8, A1, C1/P) and enumerates the policy/process gaps to close
  before an audit. Also shipped responsible disclosure: `/.well-known/security.txt` (RFC 9116)
  + a public `/security` page._

### 2.6 — Reliability & scale 🆕 (P2–P3)

- 🆕 [x] **Backup restore + PITR** — backup exists; add a documented restore path and
  point-in-time recovery runbook (closes the loop on the P0 backup item).
  _2026-06-18: `bun run db:restore -- <dump> [--clean]` (`scripts/db-restore.js`,
  `pg_restore --no-owner`) + [`docs/backup-restore.md`](./docs/backup-restore.md) — restore
  steps, Neon PITR procedure, recovery-path matrix, RPO/RTO targets, quarterly drill._
- 🆕 [ ] **Read replicas + connection pooling** — PgBouncer, read/write split in the
  Drizzle connection layer.
- 🆕 [ ] **Multi-region / active-active** — region routing + replicated session store.
- 🆕 [ ] **SLO dashboards** — burn-rate alerts built from existing Prometheus/OTel metrics.
- 🆕 [ ] **Load + chaos harness** — k6 scenarios + fault injection in CI.

### 2.7 — Growth & experimentation 🆕 (P2–P3)

Feature-flag infra with % rollout already shipped — extend it.

- 🆕 [~] **A/B experimentation framework** — variant assignment + conversion metrics on
  top of the existing feature-flag engine.
  _2026-06-18: `services/experiments.service.ts` — deterministic, sticky, weighted variant
  assignment (same FNV-1a bucketing as flag rollout, no storage) + exposure/conversion
  tracking with per-variant conversion rates (`assignVariant` / `exposeToExperiment` /
  `recordConversion` / `getExperimentResults`). Tracker is in-memory for now; durable
  persistence + an admin results view can layer on without changing the assignment contract._
- 🆕 [ ] **Pricing / paywall experiments** — test plan packaging and upgrade-prompt copy.
- 🆕 [x] **Usage-based upsell nudges** — "80% of API quota used" → in-app + email
  (now backed by real usage counters).
  _2026-06-18: `services/usageNudge.service.ts` — pure `evaluateUsageNudges` (warning ≥80%,
  exceeded ≥100%, skips unlimited/unused) + `runUsageNudges` dispatching an in-app
  notification (+ optional email), deduped per metric/level/period and throttled. Wired into
  `apiKeyAuth` after metering (throttle keeps it off the hot path)._
- [ ] **Referral + loyalty programs** — see the full P3 spec in `STARTER.md`.

---

## How to extend this roadmap

- Keep `STARTER.md` as the source of truth for the **core** backlog and per-feature
  checklists; mirror status changes here.
- Re-run the code graph (`graphify-out/`) periodically — its community map is a fast
  way to catch capabilities that have shipped but drifted out of the docs.
- New brainstorm items land in **Part 2** with a priority band and a note on where
  they plug into the existing architecture.
