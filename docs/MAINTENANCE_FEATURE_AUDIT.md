# Maintenance audit — heavy / low-use features to consider removing

**Date:** 2026-06-28
**Goal:** Reduce the maintenance surface of the zerotrust SaaS template by
identifying features that are *heavy* (lots of code, schema, deps, ongoing
upkeep) but *peripheral* to the template's core promise — authentication &
identity.

> **Status (2026-06-28):** Candidates **#2, #3, #5, #7, #9, and #10 have been
> removed** from the codebase (one commit each; see git history and
> [`tdone.md`](../tdone.md) → "Removed — maintenance slim-down"). The remaining
> candidates — **#0 (unused deps), #1 (wallet/loyalty), #4 (globalization),
> #6 (blog/changelog), and #8 (SMS/WhatsApp/Telegram OTP)** — are left in place
> for review and can be actioned later. Footprint/coupling notes below are the
> original analysis and are retained for that review.

## How candidates were scored

Each feature was rated on three axes:

- **Footprint** — lines of code (service + routes + UI), DB tables, and any
  dedicated npm dependency it pulls in.
- **Coupling** — how many other modules import it. Low coupling = safe to lift
  out without touching auth/session/org cores.
- **Relevance** — how central it is to "an auth/identity foundation you clone
  and ship." Loyalty points and shared notes are not why you pick an auth
  template.

Sizes below come from `wc -l` over `src/` and `packages/ui/src/`; coupling from
import-reference counts excluding tests.

---

## TL;DR — recommended order of removal

| # | Feature | Est. LOC | Dedicated deps dropped | Coupling | Verdict |
|---|---------|---------:|------------------------|----------|---------|
| 0 | **Unused deps** (`samlify`, `@noble/post-quantum`) | ~0 prod | `samlify`, `@noble/post-quantum`, `xpath`* | none / barrel-only | **Remove immediately** |
| 1 | **Wallet / loyalty / points / referrals / streaks** | ~1,500 | — | low (self-contained) | **Remove** |
| 2 | **Collaboration** (notes, presence, mentions, activity feed) | ~1,100 | — | low | **Remove** |
| 3 | **Decentralized identity** (`did:key` / `did:web`) | ~700 | — | low | **Remove** |
| 4 | **Globalization** (multi-currency, PPP, VAT/tax quotes) | ~1,400 | — | medium (billing) | **Remove / slim** |
| 5 | **Post-quantum KEM** (ML-KEM module) | ~300 | `@noble/post-quantum` | barrel-only, unused | **Remove** |
| 6 | **Blog + changelog** marketing pages | ~400 (UI) | — | none | **Remove** |
| 7 | **Growth tooling** (experiments, feature flags, usage nudges, analytics) | ~600 | — | low | **Slim to one** |
| 8 | **SMS / WhatsApp / Telegram OTP** | ~250 | `twilio` | MFA channel registry | **Consolidate** |
| 9 | **AI-native auth** (workload + agentic + MCP OAuth) | ~800 | — | low | **Keep only if it's your pitch** |
| 10 | **Enterprise federation** (LDAP, SCIM, SAML, OIDC, federation) | ~3,200 | `ldapts` | medium | **Keep what your buyers need** |

\* `xpath` is used by the hand-rolled SAML signature verification, so it only
drops if you also drop SAML (#10). It does **not** drop with `samlify`.

---

## Tier 0 — Free wins (unused dependencies)

These cost nothing to remove and shrink the dependency tree / attack surface today.

### `samlify` is unused
`samlify` is declared in `package.json` but **not imported anywhere**. The SAML
service provider (`src/saml/sp.ts`) is implemented by hand on `node:crypto`,
`zlib`, and `xpath`. Remove `samlify` from `dependencies` — no code change
needed.

### `@noble/post-quantum` is barrel-only
`src/crypto/post-quantum.ts` (ML-KEM / post-quantum KEM) is re-exported from
`src/index.ts` but is **not wired into any route, middleware, token, or CSFLE
flow** — nothing calls it at runtime. Unless you have a concrete PQ roadmap,
delete `src/crypto/post-quantum.ts`, its export block in `src/index.ts`, its
tests, and the `@noble/post-quantum` dependency.

---

## Tier 1 — Remove (heavy, niche, low coupling)

### 1. Wallet / loyalty / points / referrals / streaks
- **What:** `wallet.service.ts` (782 LOC) + `points.service.ts` (133) +
  `streak.service.ts` (130) + `wallet.routes.ts` (252); UI pages
  `dashboard/wallet`, `dashboard/points`, `dashboard/referrals`; schema tables
  `wallets`, `tiers`, `user_tiers`, `redemptions_catalog`, `streaks`.
- **Why remove:** Gamification/loyalty is product-specific growth tooling, not
  identity infrastructure. It is the single largest service in the repo and
  carries 5 of the 59 DB tables.
- **Coupling:** Self-contained — referenced almost entirely within its own
  routes/UI. Safe to lift.
- **To delete:** the files above, the `/wallet` mount in `server.ts`, the nav
  entries, the 5 tables (+ a drop migration), and the wallet tests.

### 2. Collaboration (notes, presence, mentions, activity feed)
- **What:** `collaboration.service.ts` (445) + `collaboration.routes.ts` (409);
  UI `dashboard/notes` (+ `[id]`); schema `presence` table; SSE presence
  plumbing.
- **Why remove:** Shared notes / presence / mentions belong to a product, not
  to an auth template. Real-time presence also keeps an extra SSE surface warm.
- **Coupling:** Low (3 referencing files outside its own module).
- **To delete:** the files above, `/collab` mount, notes UI, `presence` table.

### 3. Decentralized identity (`did:key` / `did:web`)
- **What:** `src/did/` (~504 LOC: resolver + proof-of-control + routes); UI
  `admin/did`; `/auth/did` mount.
- **Why remove:** DID is a specialized, low-adoption identity scheme. The
  resolver is also an SSRF-sensitive outbound-fetch surface (it's in the
  CWE-918 hardening list) — removing it removes a class of risk to maintain.
- **Coupling:** Low; isolated under `src/did/`.

---

## Tier 2 — Strong candidates (heavy, judgment call)

### 4. Globalization (multi-currency, PPP, VAT/tax, regions, tenants)
- **What:** `globalization.service.ts` (576) + `region.service.ts` (265) +
  `region.routes.ts` (131) + `tenant.routes.ts` (402) +
  `taxExemption.service.ts` (123); UI `admin/regions`, `admin/tenants`; tables
  `tenants`, region/tax config.
- **Why slim:** Multi-currency pricing, purchasing-power-parity discounts, VAT
  validation and tax quotes are a lot of locale/tax logic to keep correct over
  time. Most teams cloning an auth template bill in one currency via Stripe.
- **Coupling:** **Medium** — touches billing/pricing. Keep single-currency
  Stripe checkout; drop PPP/VAT/tax-quote/region machinery. Note `tenants` may
  be load-bearing if you rely on multi-tenancy — verify before dropping that
  table.

### 5. Post-quantum KEM — see Tier 0 (#5). Listed here too because it's a
"feature" in the README; it is functionally dead code.

### 6. Blog + changelog (marketing UI)
- **What:** `app/blog` (+ `[slug]`), `app/changelog` (~400 LOC UI + MDX data).
- **Why remove:** Pure marketing-site scaffolding. Most teams replace these with
  their own marketing stack. Zero backend coupling.

### 7. Growth tooling (experiments, feature flags, usage nudges, analytics)
- **What:** `experiments.service.ts` (166) + `featureFlags.service.ts` (116) +
  `usageNudge.service.ts` (137) + `analytics.service.ts` (151) +
  `usage.service.ts` (135); `feature_flags` table.
- **Why slim:** Four overlapping growth primitives. Keep at most one
  (feature flags), drop the rest or defer to a SaaS (PostHog/LaunchDarkly).

---

## Tier 3 — Consolidate, don't delete wholesale

### 8. MFA channel sprawl → drop `twilio`
TOTP + Email OTP cover the vast majority of MFA needs. `src/mfa/channels/sms.ts`
and `whatsapp.ts` are the **only** consumers of the `twilio` dependency
(plus Telegram OTP). Dropping SMS/WhatsApp/Telegram OTP removes the `twilio`
dep and three channels to keep credentialed and tested, while leaving MFA fully
functional. The channel registry makes these pluggable, so removal is localized.

### 9. AI-native auth (workload + agentic + MCP OAuth)
`workload.routes.ts` (156) + `agentic.routes.ts` (198) + `mcp.routes.ts` (315)
+ `src/workload/`. This is genuinely differentiated **if** "auth for AI agents"
is your selling point — keep it then. Otherwise it's three niche surfaces
(client-credential tokens, delegation exchange, MCP authorization server) to
maintain. Decide by product positioning, not by code size.

### 10. Enterprise federation (LDAP / SCIM / SAML / OIDC / federation)
Collectively ~3,200 LOC (`scim` 907, `oidc` 644, `ldap` 639, `saml` 491,
`federation` 489) and the `ldapts` dependency. These are real enterprise
selling points, so this is a buyer-driven decision rather than a pure
maintenance cut:
- **LDAP/AD sync** (`ldapts`) — drop if you have no on-prem-directory buyers.
- **SAML vs OIDC** — many teams standardize on one. OIDC provider + SCIM is the
  more common modern pairing; SAML is legacy-enterprise.
- Keep whichever your target customers actually procure; remove the rest to
  shed the largest single block of enterprise-integration upkeep.

---

## Estimated impact if Tiers 0–2 are removed

- **~5,000–6,000 LOC** removed from `src/` and `packages/ui/src/`.
- **3 npm dependencies** dropped (`samlify`, `@noble/post-quantum`, and
  `twilio` if #8 is taken; `ldapts` additionally if LDAP is dropped in #10).
- **~10+ DB tables** removed (wallet ×5, presence, feature_flags, region/tax,
  tenants*).
- Fewer outbound-fetch (SSRF) surfaces to keep hardened (DID resolver).

## Recommended sequencing

1. **Tier 0** first (unused deps) — risk-free, no behavior change.
2. **Tier 1** features one PR each — each is self-contained, so removal +
   drop-migration + test cleanup is mechanical and reviewable in isolation.
3. **Tier 2/3** after a product decision on positioning (billing reach,
   enterprise SSO mix, AI-agent angle).

Each removal PR should: delete the service/routes/UI/tests, remove the
`app.route(...)` mount in `src/api/server.ts`, drop the nav entries, add a
Drizzle drop-migration for the tables, prune the dependency from
`package.json`, and update `README.md` + `tdone.md` feature lists so the docs
stop advertising removed capabilities.
