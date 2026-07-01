# Maintenance audit — heavy / low-use features to consider removing

**Date:** 2026-06-28
**Goal:** Reduce the maintenance surface of the zerotrust SaaS template by
identifying features that are _heavy_ (lots of code, schema, deps, ongoing
upkeep) but _peripheral_ to the template's core promise — authentication &
identity.

> **Status (2026-07-01):** Candidates **#0, #2, #3, #5, #7, #9, and #10 have
> been removed** from the codebase (one commit each; see git history and
> [`tdone.md`](../tdone.md) → "Removed — maintenance slim-down"). The remaining
> candidates — **#1 (loyalty), #4 (globalization), #6 (blog/changelog),
> and #8 (SMS/WhatsApp/Telegram OTP)** — have been extracted as actionable items
> in [`todo.md`](../todo.md). This document retains the original analysis for
> reference; follow the todo.md items for implementation.

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

| #   | Feature                                                                  |  Est. LOC | Dedicated deps dropped           | Coupling             | Verdict          |
| --- | ------------------------------------------------------------------------ | --------: | -------------------------------- | -------------------- | ---------------- |
| 0   | **Unused deps** (`samlify`, `@noble/post-quantum`)                       |   ~0 prod | `samlify`, `@noble/post-quantum` | none / barrel-only   | **Done**         |
| 1   | **loyalty / points / referrals / streaks**                               |    ~1,500 | —                                | low (self-contained) | → **todo.md H2** |
| 2   | **Collaboration** (notes, presence, mentions, activity feed)             |    ~1,100 | —                                | low                  | **Done**         |
| 3   | **Decentralized identity** (`did:key` / `did:web`)                       |      ~700 | —                                | low                  | **Done**         |
| 4   | **Globalization** (multi-currency, PPP, VAT/tax quotes)                  |    ~1,400 | —                                | medium (billing)     | → **todo.md H1** |
| 5   | **Post-quantum KEM** (ML-KEM module)                                     |      ~300 | `@noble/post-quantum`            | barrel-only, unused  | **Done**         |
| 6   | **Blog + changelog** marketing pages                                     | ~400 (UI) | —                                | none                 | → **todo.md E1** |
| 7   | **Growth tooling** (experiments, feature flags, usage nudges, analytics) |      ~600 | —                                | low                  | **Done**         |
| 8   | **SMS / WhatsApp / Telegram OTP**                                        |      ~250 | `twilio`                         | MFA channel registry | → **todo.md E2** |
| 9   | **AI-native auth** (workload + agentic + MCP OAuth)                      |      ~800 | —                                | low                  | **Done**         |
| 10  | **Enterprise federation** (LDAP, SCIM, SAML, OIDC, federation)           |    ~3,200 | `ldapts`                         | medium               | **Done**         |

\* `xpath` is used by the hand-rolled SAML signature verification, so it only
drops if you also drop SAML (#10). It does **not** drop with `samlify`.

---

## Tier 0 — Completed free wins (unused dependencies)

These cost nothing to remove and shrink the dependency tree / attack surface.

### `samlify` is unused

`samlify` was declared in `package.json` but **not imported anywhere** after the
enterprise-federation slim-down. It has now been removed from `package.json` and
`bun.lock`, which also drops its XML/RSA transitive dependency chain. `xpath`
remains as a direct dependency because it is still used by the codebase.

### `@noble/post-quantum` is barrel-only

`src/crypto/post-quantum.ts` (ML-KEM / post-quantum KEM) is re-exported from
`src/index.ts` but is **not wired into any route, middleware, token, or CSFLE
flow** — nothing calls it at runtime. It was removed with its tests, export, and
the `@noble/post-quantum` dependency.

---

## Tier 1 — Remove (heavy, niche, low coupling)

### 1. loyalty / points / referrals / streaks — → **todo.md H2**

- **What:** `points.service.ts` (133) +
  `streak.service.ts` (130) UI pages
  `dashboard/points`, `dashboard/referrals`; schema tables
  `tiers`, `user_tiers`, `redemptions_catalog`, `streaks`.
- **Why remove:** Gamification/loyalty is product-specific growth tooling, not
  identity infrastructure. It is the single largest service in the repo and
  carries 5 of the 59 DB tables.
- **Coupling:** Self-contained — referenced almost entirely within its own
  routes/UI. Safe to lift.
- **To delete:** the files above mount in `server.ts`, the nav
  entries, the 5 tables (+ a drop migration).

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

### 4. Globalization (multi-currency, PPP, VAT/tax, regions, tenants) — → **todo.md H1**

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

### 6. Blog + changelog (marketing UI) — → **todo.md E1**

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

### 8. MFA channel sprawl → drop `twilio` — → **todo.md E2**

TOTP + Email OTP cover the vast majority of MFA needs. `src/mfa/channels/sms.ts`
and `whatsapp.ts` are the **only** consumers of the `twilio` dependency
(plus Telegram OTP). Dropping SMS/WhatsApp/Telegram OTP removes the `twilio`
dep and three channels to keep credentialed and tested, while leaving MFA fully
functional. The channel registry makes these pluggable, so removal is localized.

### 9. AI-native auth (workload + agentic + MCP OAuth)

`workload.routes.ts` (156) + `agentic.routes.ts` (198) + `mcp.routes.ts` (315)

- `src/workload/`. This is genuinely differentiated **if** "auth for AI agents"
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

## Estimated impact if the remaining Tier 1–2 candidates are removed

- **~3,000–4,000 additional LOC** removed from `src/` and `packages/ui/src/`,
  depending on whether globalization is slimmed or removed.
- **1 npm dependency** dropped (`twilio` if #8 is taken).
- **5+ DB tables** removed if loyalty is removed; additional region/tax
  tables may drop if globalization is slimmed. Verify `tenants` before dropping
  it because it may be load-bearing for deployments that use multi-tenancy.
- Fewer outbound-provider surfaces to keep configured and tested (SMS/WhatsApp/
  Telegram OTP and tax/VIES lookups if those candidates are taken).

## Recommended sequencing

1. **Tier 0** is complete — no behavior change, dependency manifests pruned.
2. **Tier 1** features one PR each — each is self-contained, so removal +
   drop-migration + test cleanup is mechanical and reviewable in isolation.
3. **Tier 2/3** after a product decision on positioning (billing reach,
   enterprise SSO mix, AI-agent angle).

Each removal PR should: delete the service/routes/UI/tests, remove the
`app.route(...)` mount in `src/api/server.ts`, drop the nav entries, add a
Drizzle drop-migration for the tables, prune the dependency from
`package.json`, and update `README.md` + `tdone.md` feature lists so the docs
stop advertising removed capabilities.
