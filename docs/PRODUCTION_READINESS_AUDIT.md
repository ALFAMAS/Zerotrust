# Production-Readiness Audit — 2026-06-25

A whole-codebase audit covering security, correctness, test coverage, and the
backend↔frontend surface. This document is the prioritized punch list of what
stands between the current tree and a production-grade release. Items fixed in
the accompanying PR are marked **✅ Fixed (this PR)**; everything else is an
open recommendation with a severity.

> Baseline at audit time: `bun install` clean, `type-check` green, `biome ci`
> green (after merging `main`), Vitest **677 passing** across 73 files, UI
> `tsc --noEmit` clean.

---

## 1. Security findings

### ✅ Fixed (this PR)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| S1 | **High** | **OAuth account takeover via unverified email.** The OAuth callback merged a *new* social identity into a pre-existing local account and logged the caller in, regardless of whether the IdP asserted the email was verified. A provider that returns an unverified address (several allow this) let an attacker sign in as the victim. | `src/api/routes/auth.routes.ts` — only auto-link/login into an existing account when `profile.emailVerified === true`; already-linked identities are unaffected. Tests added. |
| S2 | **High** | **Self-asserted OAuth linking.** `POST /auth/me/link` trusted a client-supplied `providerUserId`, so any signed-in user could attach an arbitrary (or a victim's) provider identity to their account with no proof of control. | Rewrote to exchange a real OAuth authorization `code` through the provider adapter and require a verified email; the identity is taken from the verified profile, never the request body. Tests added. |
| S3 | **Medium** | **Unauthenticated `/admin/slo`.** Mounted directly on the app with no guard, it exposed internal SLO / error-budget / burn-rate metrics under the `/admin` namespace everyone assumes is protected. | Added a reusable `requireAdmin` middleware (`src/middleware/auth.ts`) and applied it. Tests added. |
| S4 | **Medium** | **Refresh-token rotation had no reuse detection.** `POST /auth/token/refresh` revoked the presented token and issued a new one, but a *replayed* (already-rotated) token only returned 401 — it did not revoke the token family. Stolen-then-rotated tokens went undetected. | On reuse of a revoked refresh token, the handler now revokes **all** refresh tokens + active sessions for that user (`revokedReason: "refresh_token_reuse"`) and returns `TOKEN_REUSE_DETECTED`, forcing re-auth. Test added. |

### Open recommendations

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| S4b | **Low** | Refresh still mints a brand-new session row per rotation without deactivating the prior session, so sessions accumulate over a long-lived login. (The reuse-detection half of the original S4 is fixed above.) | Reuse the prior `sessionId` on refresh, or deactivate the rotated session when issuing the new one. |
| S5 | **Medium** | **Stripe webhook is not idempotent.** Signature verification is correct, but Stripe can deliver the same event more than once; handlers re-process. Most writes are upserts so impact is limited, but points/credits granted on `checkout.session.completed`-style flows could double-apply as the billing surface grows. | Persist processed `event.id`s (short TTL) and no-op on replay. |
| S6 | **Low** | **Access/refresh tokens stored in `localStorage`** (`packages/ui/src/lib/auth.ts`). Readable by any XSS. The app has good XSS hygiene, but tokens in JS storage remain the weakest link. | Prefer `HttpOnly; Secure; SameSite` cookies for the refresh token (and ideally a short-lived in-memory access token), or document the tradeoff explicitly. |
| S7 | **Low** | **CSRF posture depends entirely on bearer-token auth.** Since auth is `Authorization: Bearer` (not cookies), classic CSRF doesn't apply — but this is an invariant worth asserting in a test so a future move to cookie auth doesn't silently open CSRF. | Add a regression test documenting the bearer-only invariant; revisit if S6 moves tokens to cookies. |

---

## 2. Test coverage

- **Coverage regression introduced on `main` — ✅ addressed (this PR):** the
  org-routes rewrite (`fix organization routes`, merged to `main`) deleted
  `src/__tests__/org.routes.test.ts` (~699 lines), leaving `org.routes.ts` — a
  core multi-tenant surface — untested. This PR adds a fresh
  `src/__tests__/org.routes.test.ts` (14 tests) covering the owner/admin/member
  RBAC boundaries: non-members blocked, members can't update, admins can invite
  but only owners can delete/transfer, and the owner can't be removed. Deeper
  invite/membership-lifecycle coverage remains a good follow-up.
- **Added this PR:** OAuth account-linking safety (×3), `/auth/me/link`
  verified-linking (×6), `requireAdmin` guard (×4), client PoW solver (×3),
  anomaly `riskBand` (×4).
- **High-value paths still thin on tests:** `token.service` rotation/reuse
  (see S4), SAML ACS assertion validation, SCIM token auth boundaries, the
  frontend API client's concurrent-401 refresh dedup (`lib/api.ts`).
- **Frontend has no component-test harness** — no `@testing-library/react` or
  jsdom/happy-dom is installed, so only pure-logic/lib tests are possible today.
  **Recommendation (P2):** add `@testing-library/react` + `happy-dom` and a
  vitest project for `*.tsx` so pages/components can be tested.

---

## 3. Unmounted backend → frontend surface

Backend capabilities with **no UI** (or only partial wiring). The API is far
ahead of the dashboard here.

| Backend surface | Status | Notes |
|-----------------|--------|-------|
| `/admin/anomaly/*` | **✅ Wired (this PR)** | New `/admin/anomaly` console: baselines + reset + risk scoring. |
| `/regions/*` (data residency) | ❌ Unmounted | Per-org `storageRegion`, geo-routing, region health — no admin UI. |
| `/admin/tenants/*` (tenant mgmt) | ❌ Unmounted | Tenant CRUD, per-tenant SSO/plans, branding/residency — no UI. |
| `/wallet/top-up`, `/wallet/spend` | ❌ Unmounted | Points page shows tier + redemptions; no balance top-up / spend flow. |
| `/auth/mfa/otp/*` (email/SMS/WhatsApp/Telegram OTP) | ❌ Unmounted | Security page wires TOTP only; alternate OTP channels unsurfaced. |
| `/email-events`, `/auth/unsubscribe` | ❌ Unmounted | Deliverability/bounce events have no admin view. |
| `/mcp/*` (MCP OAuth server) | ➖ N/A | Protocol endpoints for agents — no human UI expected. |
| `/agentic/*` | ◐ Partial | Approvals inbox exists; delegation context/issuer not surfaced. |
| `/notifications/channels` (Slack/Teams/PagerDuty) | ◐ Partial | Admin alerts page wires some channel management. |

**Recommendation:** prioritize **Tenant management** and **Data residency**
admin consoles (enterprise-blocking), then **MFA alternate channels** and
**wallet top-up** (user-facing). The anomaly console added here is the
reference pattern (shadcn `Card`/`Table`/`Badge`/`Button`).

---

## 4. UI / shadcn migration — ✅ completed (this PR)

- shadcn/ui is scaffolded (`components.json`, 18 primitives under
  `components/ui/`). This PR migrated the app onto those primitives:
  - **Every interactive data table** now uses shadcn `Table`: `admin/sessions`,
    `admin/users`, `admin/audit`, `admin/access-reviews` (+ `[id]`),
    `dashboard/webhooks`, plus the new `admin/anomaly`/`admin/tenants`/
    `dashboard/wallet` consoles. The only remaining `<table>` is the static
    `privacy` cookie list — also converted.
  - **Every native `<select>`** was replaced with the shadcn `Select`
    (api-keys, admin revenue, support, billing, org invite-role + transfer).
  - The legacy `Badge`/`Modal` helpers were already thin wrappers over the
    shadcn `Badge`/`Dialog`, so pages using them are shadcn-backed.
- Verified: `biome ci` 0 errors, UI `tsc` clean, `next build` green in CI.
- **Remaining polish (P3):** route the various ad-hoc inline toasts through the
  installed `sonner` component for one consistent toast system.

---

## 5. Operational / release gaps

| Severity | Gap | Recommendation |
|----------|-----|----------------|
| P1 | **CI lints the merge-with-main**, and `main` currently carries formatting drift + low-signal commits (`"1"`, `"0"`). A green feature branch can still fail PR CI. | Enforce `biome ci` as a required status on pushes to `main` (not just PRs) and block direct pushes so drift can't land. |
| P1 | **`biome ci` floats on `^2.5.0`.** Formatter output can change across minor versions, causing non-reproducible CI failures. | Pin `@biomejs/biome` to an exact version. |
| P2 | **Elasticsearch dependency is soft** (`search.service.ts` dynamically requires `@elastic/elasticsearch`); README lists full-text search as a feature. | Either add the dep to `package.json` or keep the README explicit that ES is opt-in (DB fallback otherwise). |
| P2 | **Compliance doc drift:** `docs/compliance/audit-log-anchoring-plan.md` still describes hash-chain anchoring as "not implemented" though the code ships it. | Reconcile the doc. |
| P3 | **GitHub Actions Node 20 deprecation** warnings in CI logs. | Bump `actions/*` to Node 24-compatible versions. |

---

## 6. What this PR changes

1. **Security:** S1, S2, S3, S4 fixed with tests.
2. **Unmounted feature:** Anomaly Detection admin console wired (shadcn).
3. **Tests:** +21 (backend security + frontend lib).
4. **Docs:** this audit.
5. **Hygiene:** merged `main` and restored `biome ci` green on the merge commit.

Follow-ups are tracked in sections 1–5 above; the highest-priority next steps
are **restoring org-routes test coverage (P1)** and **pinning Biome / enforcing
`biome ci` on `main` (P1)**.
