# Production-readiness audit — 2026-07-15 (supplemental)

**Scope:** blockers that keep the repository from being an honest, production-ready
SaaS **starter template**. Complements the same-day
[`codebase-audit-2026-07-15.md`](./codebase-audit-2026-07-15.md) (stability /
security delta); this pass focused on claims-vs-implementation drift, product
traps a template consumer would inherit, and re-verification of the boot-time
production guards.

**Priority:** **P0** = ship blocker · **P1** = fix before production scale · **P2** = planned improvement.

## Executive summary

| ID | Priority | Area | Finding | Status |
| --- | --- | --- | --- | --- |
| **MKT-1** | **P0** | Honesty / legal | Marketing and legal surfaces claimed features that do not exist: SAML 2.0 SSO, an OIDC identity **provider**, and SMS/WhatsApp/Telegram MFA (landing features + standards strip, pricing tiers + comparison, terms of service, dashboard billing tiers, default announcement badge). | **Shipped 2026-07-15** — all surfaces now describe shipped features only |
| **MFA-SMS-1** | **P1** | Product trap | Admin → Auth Settings exposes an **SMS OTP** toggle (`smsOtpEnabled` in `saasSettings.service.ts`, admin settings schema, and the UI) but there is **no SMS delivery service** in the codebase. Enabling it advertises a channel that can never deliver a code. | Open — wire a provider (see `docs/extending.md`) or hide the toggle until one exists |
| **BILL-PRICE-1** | **P2** | Consistency | Plan prices are env-configurable (`PLAN_PRO_PRICE_MONTHLY`, `PLAN_ENTERPRISE_PRICE_MONTHLY` in `src/shared/plans.ts`) but the public `/pricing` page and `dashboard/billing/BillingClient.tsx` hardcode $29/$99 — and the dashboard shows Enterprise as “Custom / Contact us” while `/pricing` shows $99. Needs one source of truth (e.g. `NEXT_PUBLIC_*` price vars or a public pricing endpoint). | Open |
| **JIT-1** | **P1** | Broken page | `GET /jit/cross-tenant/incoming` required an `orgId` the UI never sent, so `/admin/jit` always rendered an error state (masked in CI because the Playwright job was skipped behind a failing unit-test job). | **Shipped 2026-07-15** (PR #100) |

## Verified healthy (no action)

- **Boot guards:** production boot fails fast without `DATABASE_URL`,
  `TOKEN_SECRET_HEX` / `CSFLE_MASTER_KEY_HEX` (≥32 bytes), and `REDIS_URI`
  (`src/config/index.ts`, `src/config/env.ts`).
- **CORS:** explicit allowlist via `CORS_ALLOWED_ORIGINS`; wildcard requires
  deliberate opt-in (`src/middleware/cors.ts`).
- **Stripe webhooks:** signature always verified
  (`constructEventAsync`) and processing is idempotent via the
  `stripeEvents` repository claim/release pattern.
- **Rate limiting:** Redis-backed with a documented per-process in-memory
  fallback (dev convenience; production requires Redis and says so at boot).
- **Real features previously advertised alongside the false ones** were
  confirmed implemented: geofencing (`GEOFENCING_ENABLED` +
  `authz.service.ts`), proof-of-possession middleware, SCIM 2.0 routes,
  cross-tenant JIT, CSFLE, hash-chained audit log.

## Operator blockers (unchanged, tracked in [`todo.md`](./todo.md))

**SEC-ROT** (rotate the leaked Neon credential), **OPS-ENV-1** (create GitHub
`staging`/`production` environments + deploy secrets), **MIG-3** (apply RLS /
audit-trigger migrations to `db:push`-provisioned databases), and the
pre-launch sign-off walk in
[`production-checklist.md`](../production-checklist.md). These are
configuration/credential actions only a repo or infra admin can perform; the
repository code is not the blocker.

## MKT-1 detail — what changed

| Surface | Was | Now |
| --- | --- | --- |
| Landing features | “OIDC provider”, “SAML 2.0 SSO”, MFA “SMS, WhatsApp, Telegram” | Cross-tenant JIT access, field-level encryption (CSFLE), MFA “TOTP + email OTP” |
| Landing standards strip | “SAML 2.0” | “TOTP (RFC 6238)” |
| Landing pricing teaser | Enterprise “SAML SSO, …” | “Unlimited usage, SCIM, priority support” |
| `/pricing` Enterprise tier + comparison | “SAML 2.0 SSO (Okta, Entra ID, Google Workspace)” | “Custom domains and branding” (what the `ssoSaml` plan gate actually protects — `region.routes.ts`) |
| Terms of service | “MFA (TOTP, Email OTP, SMS, WebAuthn)”, “OIDC Provider and SAML 2.0 … integrations” | Shipped methods only; orgs/billing/audit bullet |
| Dashboard billing tiers | Enterprise “SAML SSO” | “Custom domains” |
| `brand.ts` default badge | “Now with OIDC provider + SAML 2.0” | “Auth, orgs, and billing — wired and hardened” |

The `ssoSaml` plan-gate key in `src/shared/plans.ts` is retained (it gates org
custom domains); if SAML is built later the marketing can be restored with the
implementation.
