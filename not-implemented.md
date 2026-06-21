# ZeroAuth — Not Yet Implemented

Backlog of features, gaps, and follow-ups that have not landed yet. Anything in
[`implemented.md`](./implemented.md) is shipped — this file is everything else,
grouped by where the work would land. For code that _exists_ in the tree but is
unmounted, stubbed, or orphaned, see [`incomplete.md`](./incomplete.md).

**Legend:** 🆕 net-new idea · ⚡ backend exists, needs surfacing/finishing ·
[~] partial / behind a flag · priority bands P0 → P3 (P0 = launch blocker,
P3 = differentiation).

When you ship an item, **delete it from this file** and add it to
`implemented.md`. These two files are kept in lockstep.

---

## P0 — Launch blockers

_None remaining — all P0 items shipped. See `implemented.md`._

---

## P1 — Core growth (first month)

### Self-serve enterprise (close the SSO gap)

- [ ] **Self-serve SSO per org** — org admins configure SAML/OIDC from the dashboard; metadata upload + test connection, no redeploy
- [ ] **Self-serve SCIM token per org** — generate/rotate a SCIM bearer token in org settings UI
- [x] **Org passkey policy** — drive the existing MDS3 attestation engine from an org-level toggle ("hardware keys only", "require attestation")
  _Shipped: `org_security_policies` table (requirePasskeyAttestation / requireHardwarePasskey / allowedPasskeyAaguids / deniedPasskeyAaguids); `GET/PUT /:orgId/security/policy` in `org.routes.ts`; enforcement via `verifyAttestation()` + `KNOWN_HARDWARE_KEY_AAGUIDS` in `passkey.routes.ts`; UI in the org Settings → Security policy form; tests in `org.routes.test.ts`._
- [ ] **Trusted-device list per org** — let org admins register/require trusted devices (needs a device-enrolment flow). _Split out of the shipped "Session & device policy per org" (see `implemented.md`), which covers max session age, idle timeout, concurrent-session cap, and geo/IP rules._

### Trust, safety & abuse prevention

- [ ] **Account merge / linking** — link an OAuth identity to an existing email account instead of creating a duplicate

### Agentic & AI-native auth

- [ ] **MCP authorization server** — implement the MCP auth spec on top of the existing OIDC provider so MCP clients can obtain scoped tokens
- [ ] **On-behalf-of / "act-as" delegation** — actor claims via the existing `exchangeToken()`, so an agent acts for a user with a verifiable delegation chain (backend exists, flow not wired through the UI / docs)

---

## P2 — Quality & scale (first quarter)

### i18n Completeness

- [ ] **RTL layout support** — `dir="rtl"` on `<html>`; audit CSS for absolute positioning that breaks in RTL _(deferred: all configured locales (en/es/fr) are LTR; revisit when an RTL locale (ar/he) is added)_
- [ ] **Locale-aware email templates** — finish moving remaining templates onto the per-locale dictionary (`templates/emails/i18n.ts`); welcome + verify-email already localized

### Customer support

- [ ] **Live chat widget** _(shipped via `LiveChatWidget`; flag here because there's no in-app / native chat fallback if the third-party provider is unset — currently a graceful no-op)_

### Agentic & AI-native auth

- [ ] **Human-in-the-loop approval** — reuse continuous-verification challenges to require a human approval step before an agent performs sensitive actions
- [ ] `[~]` **Agent-aware audit log** — finish wiring `AuditPrincipal` through every audit call site; full coverage + act-as exchange flow still to be wired

### Developer platform

- [ ] **Auto-generated SDKs** — TS + Python clients from the existing OpenAPI spec, published to npm / PyPI
- [ ] **Per-key & per-plan rate limits + quotas** — extend rate limiting and usage metering
- [ ] **Full webhook delivery logs** — durable Postgres storage for per-attempt history (currently bounded in-memory ring buffer; endpoints are still in-memory)

### Compliance, data & residency

- [ ] **Data residency per org** — EU / US / APAC storage region (pulled forward from P3)
- [ ] **Privacy records** — ROPA, consent receipts, auto-generated DPA
- [ ] `[~]` **SOC 2 Type II readiness** — see Compliance Gaps section below

### Reliability & scale

- [ ] **Read replicas + connection pooling** — PgBouncer, read/write split in the Drizzle connection layer
- [ ] **Multi-region / active-active** — region routing + replicated session store
- [ ] **SLO dashboards** — burn-rate alerts built from existing Prometheus / OTel metrics
- [ ] **Load + chaos harness** — k6 scenarios + fault injection in CI

### Growth & experimentation

- [ ] **Pricing / paywall experiments** — test plan packaging and upgrade-prompt copy on top of `experiments.service.ts`
- [ ] `[~]` **A/B experimentation framework** — add durable persistence + admin results view on top of the in-memory tracker
- [ ] **Referral + loyalty programs** — see Loyalty / Referral / Gamification sections below

---

## P3 — Differentiation (after core is stable)

### Revenue expansion

- [ ] **Lifetime deal (LTD) plan type** — one payment, no subscription, with usage-cap enforcement
- [ ] **Multi-currency pricing** — display in user's local currency; Stripe FX handling
- [ ] **Purchasing Power Parity (PPP)** — automatic regional discounts by country
- [ ] **Stripe Tax** — auto-calculate VAT / GST / sales tax by customer location

### White-labeling & Enterprise

- [ ] **Custom domain per tenant** — orgs map `app.theirdomain.com` to the platform
- [ ] **Per-tenant branding** — org logo, brand color, and app name override defaults
- [ ] **Custom email domain** — org sends transactional email from `noreply@theirdomain.com`
- [ ] **Custom subdomain** — auto-provision `theirorg.yourapp.com` on org creation
- [ ] **Custom login page** — org-specific login URL with their branding
- [ ] **Remove "Powered by" badge** — white-label tier hides all starter branding

### Integrations & automation

- [ ] **Zapier integration** — triggers (new user, new payment) and actions (create user, update plan)
- [ ] **Make (Integromat)** — share OpenAPI spec to auto-generate module
- [ ] **Slack app** — slash commands + DM notifications for key events
- [ ] **Native integration marketplace** — `/integrations` with per-user OAuth flows
- [ ] **HubSpot / Salesforce CRM sync** — push signups and plan changes; sync contacts back
- [ ] **Segment.io or Rudderstack** — server-side analytics pipeline to any downstream tool

### Mobile

- [ ] **React Native / Expo app** — shared auth logic; biometric login (Face ID / fingerprint) via passkeys
- [ ] **Deep universal links** — iOS App Clips / Android Instant Apps for invite and magic-link flows

### Loyalty & rewards

- [ ] **Points model** — balance, lifetime total, expiry per user
- [ ] **Earning rules engine** — daily login, referral, first payment, profile complete
- [ ] **Tier system** — Bronze / Silver / Gold / Platinum with perks per tier
- [ ] **Redemption catalog** — account credit, feature unlock, extended trial, swag codes
- [ ] **Points history page** — timestamped ledger
- [ ] **Expiry policy** — points expire after 12 months of inactivity

### Referral & affiliate

- [ ] **Referral link generator** — unique signed short-link per user
- [ ] **Referral tracking** — cookie + UTM attribution, `referredBy` on new user
- [ ] **Referral rewards** — credit or points when referee converts to paid
- [ ] **Referral dashboard** — clicks, signups, conversions per link
- [ ] **Affiliate portal** — commissions, payout history, payment threshold
- [ ] **Fraud detection** — flag self-referrals, same-IP patterns

### Gamification & engagement

- [ ] **Achievement badges** — "First Login", "Power User", "Early Adopter"
- [ ] **Streak tracking** — daily login streak with grace period
- [ ] **Progress bars** — onboarding %, profile completeness %, plan usage %
- [ ] **Weekly / monthly challenges** with point rewards
- [ ] **Social sharing** — tier achievement share card (Satori OG image)
- [ ] **Level-up notifications** — in-app + email on tier change

### Advanced search

- [ ] **Global command palette** — `Cmd+K` across users, settings, docs, recent actions
- [ ] **Elasticsearch full-text search** — index user content, surface results with highlighting
- [ ] **Faceted filters** — type, date, plan, status with instant counts
- [ ] **Search analytics** — log zero-result queries

### Collaboration & activity

- [ ] **Team activity feed** — per-org timeline of who did what
- [ ] **@mentions** — trigger in-app + email notification
- [ ] **Real-time presence** — show online team members (WebSocket heartbeat)
- [ ] **Shared notes** — lightweight collaborative notes per org (Tiptap)

### Customer success

- [ ] **Health score per account** — composite score from login frequency, feature depth, team size
- [ ] **At-risk account alerts** — Slack / email to CS team when score drops
- [ ] **Automated lifecycle emails** — D1 welcome, D3 tips, D7 check-in, D14 trial expiry
- [ ] **NPS survey automation** — in-app prompt after 30 days, quarterly thereafter
- [ ] **Customer segments** — tag accounts as "champion", "at-risk", "expansion candidate"

### Tax, multi-currency & global

- [ ] **Tax exemption certificates** — nonprofits and B2B EU orgs submit VAT ID
- [ ] **EU VAT compliance** — collect and validate EU VAT numbers via VIES

### AI & smart features

- [ ] **AI-powered onboarding assistant** — chat widget using Claude / GPT-4o
- [ ] **Smart search** — semantic search or embeddings across user data
- [ ] **Churn prediction score** — logistic regression on usage signals
- [ ] **Auto-generated weekly digest email** — LLM summary of account activity
- [ ] **AI support bot** — trained on help docs, escalates to human
- [ ] **Usage recommendations** — personalized feature suggestions

### Product analytics

- [ ] **Funnel tracking** — signup → activation → paid conversion
- [ ] **Per-feature analytics** — PostHog or Plausible events for feature usage

### File storage & uploads

- [x] **S3-compatible storage** — _shipped:_ provider-agnostic adapter (AWS S3,
  Backblaze B2, Cloudflare R2, MinIO, Wasabi) in `src/services/objectStorage.service.ts`;
  drives both DB backups and S3-backed avatar uploads. See `implemented.md`.
- [ ] **Pre-signed upload URLs** — secure direct-to-storage uploads from browser
  (current uploads go through the API via `uploadBuffer()`, not direct)
- [ ] **File attachments** — per-feature uploads with type / size validation
- [ ] **CDN delivery** — `[~]` `BACKUP_S3_PUBLIC_URL_TEMPLATE` allows a CDN/custom-domain
  override for object URLs; no dedicated edge-cache config beyond that

### API keys (extended)

- [ ] **Scope enforcement per route** — gate routes by required scope in middleware
- [ ] **Key rotation policy** — force rotation after N days
- [ ] **Rate limiting per key** — separate budgets per key

### i18n polish

- [ ] **hreflang tags** on marketing pages

### Marketing site

- [ ] **Onboarding completion event** — fire analytics event + notify sales/Slack on new signups

---

## Performance Optimizations

### Tier 1 — auth-path scaling (highest ROI)

1. **Passkey auth N+1** — currently loads the entire `users` table and scans in
   JS to match `credentialId` (`passkey.routes.ts:256-268`; `passkeys` is a
   `jsonb` column with no index). O(n) over all users per passkey login.
   _Fix:_ add a dedicated `passkeys` table with a unique index on `credentialId`,
   backfill from the jsonb column, dual-write, then cut reads over, then drop
   jsonb in a follow-up migration.

2. **Session validation hits Postgres on every protected request** — 3 sequential
   queries (session select, user select, `lastActivityAt` update) in
   `middleware/auth.ts:45`, `:75`, `:142`. _Fix:_ Redis session cache at
   `session:{tokenId}` with short TTL (capped at `expiresAt`), explicit
   invalidation on every revocation path, debounced `lastActivityAt` writes,
   graceful degrade to all-DB path when Redis is down.

3. **Sequential session revocation** — one `UPDATE` per session in a loop in
   `sessionControl.ts:25-32`. _Fix:_ single `db.update(...).where(inArray(...))`.
   Low risk, immediate win.

### Tier 2 — batch / index cleanups

4. Billing lifecycle does per-subscription DB lookup + **direct** email send in a
   loop (bypasses the BullMQ queue) in `services/billingLifecycle.service.ts:83-112`.
5. Admin broadcast sends emails sequentially in
   `api/routes/admin-tools.routes.ts:295-302`.
6. Missing indexes: `sessions(userId, isActive)`, `sessions(expiresAt, isActive)`,
   `subscriptions(status)`, `notifications(userId, read)`, `auditLogs(timestamp)`,
   `apiKeys(userId)`.
7. OAuth state held in an unbounded in-memory `Map`; TTL cleanup only on access
   (`api/routes/auth.routes.ts`).

### Tier 3 — client / UI

8. 30s polling for notifications and status even though the API already exposes
   WebSocket / SSE notifications (`NotificationBell.tsx`, `status/page.tsx`).
9. No client-side request dedup/caching (no SWR / React Query); each component
   refetches on mount (`lib/api.ts`).
10. No retry/backoff or timeout in the fetch wrapper (`lib/api.ts`).

---

## Compliance Gaps (SOC 2 Type II readiness)

Mapped to the TSC. These are the policy and
process gaps remaining before an audit:

- [ ] **Formal policies** — Information Security, Access Control, Incident
      Response, Change Management, Vendor Management, BCP/DR (written + approved)
- [x] **Access reviews** — tooling shipped (`/admin/access-reviews`, see
      `implemented.md`); _process gap remaining:_ run it quarterly and retain the
      completed reviews as evidence
- [ ] **Onboarding/offboarding** — documented joiner/leaver checklist with
      timely access revocation evidence
- [ ] **Risk assessment** — annual documented risk assessment + treatment plan
- [ ] **Vendor management** — sub-processor inventory + security review records
- [ ] **Incident response** — runbook + post-incident reviews; tabletop exercise
- [x] **Tamper-evident audit log** — SHA-256 hash-chain shipped (see
      `implemented.md`); _optional hardening:_ anchor the latest `entry_hash` to an
      external notary/transparency log
- [ ] **Backup restore drill** — evidence of periodic successful restores.
      _The previous `docs/backup-restore.md` runbook was removed with the `docs/`
      folder; the restore tooling still exists (`bun run db:backup`,
      `src/services/dbBackup.service.ts`, Neon PITR), but the runbook + periodic
      drill evidence need to be re-established._
- [ ] **Monitoring evidence** — alert acknowledgement + on-call records
- [ ] **Auditor + window** — engage a CPA firm; select the observation period

---

## How to use this file

- When you start a task, find it here. If it's not, add it.
- When you ship, **delete it from this file** and add the row to
  [`implemented.md`](./implemented.md).
- Priority bands are guidelines — order by business value + dependency, not by
  the band label alone.
- New ideas land at the bottom under "Ideas" (none currently) or with a band if
  the priority is clear.
