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

- [ ] Offline support — cache shell, queue writes, sync on reconnect
- [ ] Deep linking — invite + magic-link in browser and PWA
- [ ] Web push notifications — service worker + Push API

**Onboarding & UX**

- [x] Empty states — shared `EmptyState` component
- [ ] Product tour — Shepherd.js / Driver.js first-login walkthrough
- [x] Welcome email on registration

**i18n Completeness**

- [ ] Locale-aware formatting — `Intl.*` everywhere
- [ ] Locale-aware email templates
- [ ] RTL layout support
- [x] Missing-translation fallback to English

**Customer Support**

- [ ] Live chat widget — Crisp / Intercom / Tawk.to
- [ ] Support ticket model

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

- ⚡ [~] **Decentralized Identifiers (DID)** — `resolveDID()`, `resolveDIDWeb()`,
  `resolveDIDKey()`, base58 codec already exist (`Did Module`). Document the
  resolver, add `did:web` support for orgs, and expose a verify endpoint.
  _2026-06-15: router mounted at `/auth/did` — `GET /resolve`, `POST /challenge`,
  `POST /verify` (proof-of-control). Login-via-DID deferred: `provisionDIDUser()`
  was a stub against a Mongoose API and the users table has no `did` column — needs
  a schema migration + Drizzle-backed upsert first._
- ⚡ [ ] **Post-quantum crypto** — hybrid KEM is implemented (`createKEMProvider()`,
  `generatePQKeyPair()`, `establishPQSessionKey()`, `hybridEncrypt/Decrypt` in
  `Crypto Post`). Productize: PQ-protected token/session option behind a flag,
  document the threat model, add a "crypto agility" config switch.
- ⚡ [ ] **Token exchange / identity federation (RFC 8693)** — `exchangeToken()`,
  `initFederationFromEnv()`, `listProviders()` exist (`Federation & Token Exchange`).
  Surface a federation admin UI and document the on-behalf-of / impersonation flows.
- ⚡ [ ] **FIDO attestation & MDS3** — `AttestationPolicy`, `AttestationType`,
  `KNOWN_HARDWARE_KEY_AAGUIDS`, MDS3 verification, CA-pin store all exist
  (`Mfa Attestation`). Expose as an **org-level passkey policy** ("hardware keys only",
  "require attestation").
- ⚡ [~] **Cross-tenant JIT access** — `requestCrossTenantAccess()`,
  `CrossTenantJITStore` exist (`Jit Cross`). Build the approval-inbox UI and audit view.
  _2026-06-15: router mounted at `/jit/cross-tenant` — request/list/status + admin
  approve/deny/incoming with role guards. Store is in-memory (grants are ≤1h);
  approval-inbox UI + durable audit view still pending._
- ⚡ [ ] **CSFLE field encryption** — `CSFLEManager`, key versioning, encrypt/decrypt
  plugin exist (`Crypto Csfle`). Document which fields are encrypted and add a
  key-rotation runbook.

### 2.1 — Agentic & AI-native auth 🆕 (P1–P2)

The frontier for an auth platform in 2026. ZeroAuth already has an OIDC provider,
RFC 8693 token exchange, and scoped API keys — the foundation is in place.

- 🆕 [ ] **Agent / workload identity** — issue short-lived, narrowly-scoped tokens to
  AI agents and services (client-credentials + token exchange). Distinguish agent
  principals from human users.
- 🆕 [ ] **MCP authorization server** — implement the MCP auth spec on top of the
  existing OIDC provider so MCP clients can obtain scoped tokens.
- 🆕 [ ] **On-behalf-of / "act-as" delegation** — actor claims via the existing
  `exchangeToken()`, so an agent acts for a user with a verifiable delegation chain.
- 🆕 [ ] **Human-in-the-loop approval** — reuse continuous-verification challenges to
  require a human approval step before an agent performs sensitive actions.
- 🆕 [ ] **Agent-aware audit log** — tag every audit event as human vs. agent and
  record the delegation chain.

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
- 🆕 [ ] **IP allowlist per org** — restrict API + dashboard to CIDR ranges
  (pulled forward from P3).

### 2.3 — Trust, safety & abuse prevention 🆕 (P1–P2)

Builds on HIBP + lockout + anomaly detection + device fingerprinting already shipped.

- 🆕 [ ] **Disposable-email blocking** — reject throwaway domains + MX validation on register.
- 🆕 [ ] **Bot / abuse signals** — proof-of-work or CAPTCHA fallback on suspicious signups.
- 🆕 [ ] **Credential-stuffing defense** — IP reputation + global velocity limits layered
  on the per-IP rate limiter.
- 🆕 [ ] **Email deliverability hardening** — SPF/DKIM/DMARC setup guide, bounce/complaint
  webhooks, suppression list (protects sender reputation for the BullMQ queue).
- 🆕 [ ] **Account merge / linking** — link an OAuth identity to an existing email account
  instead of creating a duplicate.

### 2.4 — Developer platform 🆕 (P2)

OpenAPI spec already exists (`Api Openapi` community) — leverage it.

- 🆕 [ ] **Auto-generated SDKs** — TS + Python clients from the OpenAPI spec, published to npm/PyPI.
- 🆕 [ ] **Sandbox / test-mode keys** — separate live vs. test API keys, mirroring Stripe.
- 🆕 [ ] **Per-key & per-plan rate limits + quotas** — extend rate limiting and usage metering.
- [ ] **Webhook delivery logs UI** — persisted per-attempt history (already flagged in STARTER).
- 🆕 [ ] **API versioning** — version prefix + deprecation headers + sunset policy.

### 2.5 — Compliance, data & residency 🆕 (P2–P3)

Audit log already streams to Elasticsearch — extend the pipeline.

- 🆕 [ ] **SIEM streaming** — fan out audit events to Datadog / Splunk / S3.
- 🆕 [ ] **Tamper-evident audit log** — hash-chain / Merkle anchoring for legal defensibility.
- 🆕 [ ] **Data residency per org** — EU / US / APAC storage region (pulled forward from P3).
- 🆕 [ ] **Privacy records** — ROPA, consent receipts, auto-generated DPA.
- 🆕 [ ] **Legal hold** — override retention auto-purge for accounts under hold.
- [ ] **SOC 2 Type II readiness** — access-control evidence, change mgmt, incident response.

### 2.6 — Reliability & scale 🆕 (P2–P3)

- 🆕 [ ] **Backup restore + PITR** — backup exists; add a documented restore path and
  point-in-time recovery runbook (closes the loop on the P0 backup item).
- 🆕 [ ] **Read replicas + connection pooling** — PgBouncer, read/write split in the
  Drizzle connection layer.
- 🆕 [ ] **Multi-region / active-active** — region routing + replicated session store.
- 🆕 [ ] **SLO dashboards** — burn-rate alerts built from existing Prometheus/OTel metrics.
- 🆕 [ ] **Load + chaos harness** — k6 scenarios + fault injection in CI.

### 2.7 — Growth & experimentation 🆕 (P2–P3)

Feature-flag infra with % rollout already shipped — extend it.

- 🆕 [ ] **A/B experimentation framework** — variant assignment + conversion metrics on
  top of the existing feature-flag engine.
- 🆕 [ ] **Pricing / paywall experiments** — test plan packaging and upgrade-prompt copy.
- 🆕 [ ] **Usage-based upsell nudges** — "80% of API quota used" → in-app + email
  (now backed by real usage counters).
- [ ] **Referral + loyalty programs** — see the full P3 spec in `STARTER.md`.

---

## How to extend this roadmap

- Keep `STARTER.md` as the source of truth for the **core** backlog and per-feature
  checklists; mirror status changes here.
- Re-run the code graph (`graphify-out/`) periodically — its community map is a fast
  way to catch capabilities that have shipped but drifted out of the docs.
- New brainstorm items land in **Part 2** with a priority band and a note on where
  they plug into the existing architecture.
