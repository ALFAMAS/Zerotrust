# zerotrust — TODO

Consolidated, prioritized backlog. Sources:
[`docs/AUDIT.md`](./docs/AUDIT.md) (2026-06-29),
[`docs/MAINTENANCE_FEATURE_AUDIT.md`](./docs/MAINTENANCE_FEATURE_AUDIT.md)
(2026-06-28), and the standing architecture reviews. Shipped features are
tracked in [`tdone.md`](./tdone.md), not here.

**Priorities:** P0 critical/security · P1 stability/correctness · P2
maintainability/refactor · P3 scalability/performance · P4 docs/DX.
**Status:** Pending · In Progress · Done.

Sorted easiest → hardest within each tier.

---

## Easy — Low effort, meaningful impact

### E1 — Remove Blog + changelog marketing pages — _Status: Done (2026-07-01)_

- **Source:** `docs/MAINTENANCE_FEATURE_AUDIT.md` #6 (Tier 2)
- **Why:** Pure marketing UI — `app/blog` (+ `[slug]`), `app/changelog` (~400 LOC
  - MDX data). Most teams replace these with their own marketing stack. Zero
    backend coupling.
- **Impact:** ~400 LOC removed, 0 deps dropped, 0 DB tables affected.
- **Acceptance:** Delete UI files + nav entries + MDX data; update README.
- **Risk:** None — no backend or DB dependency.

### E2 — Consolidate MFA channels — drop SMS/WhatsApp/Telegram OTP — _Status: Done (2026-07-01)_

- **Source:** `docs/MAINTENANCE_FEATURE_AUDIT.md` #8 (Tier 3)
- **Why:** TOTP + Email OTP cover the vast majority of MFA needs. The `twilio`
  dependency exists **only** for SMS/WhatsApp OTP (~250 LOC across
  `src/mfa/channels/sms.ts`, `whatsapp.ts`, `telegram.ts`). Dropping these three
  channels removes `twilio` and keeps MFA fully functional.
- **Impact:** ~250 LOC removed, 1 npm dep dropped (`twilio`), 0 DB tables affected.
- **Acceptance:** Delete SMS/WhatsApp/Telegram channel files + `twilio` from
  `package.json`; verify TOTP + Email OTP still work.
- **Risk:** Low — channel registry is pluggable, removal is localized.

---

## Medium — Moderate effort, high maintainability payoff

### M1 — Reduce `as any` casts (213 instances) — _Status: Pending_

- **Source:** `docs/AUDIT.md` M2
- **Why:** 213 `as any` casts in `src/`, concentrated in webhook/Stripe handling
  and middleware. Each is a place the type system stops helping — a Stripe API
  shape change fails silently at runtime rather than at compile time.
- **Impact:** Type safety across the entire backend; catches API shape drift.
- **Acceptance:** Replace `as any` with proper types; start with high-risk areas
  (Stripe webhook body, OAuth provider payloads, SSF event data).
- **Risk:** Low — mechanical changes; existing tests catch regressions.

### M2 — Plugin/capability contract for optional-heavy integrations — _Status: Pending_

- **Source:** `todo.md` P3.4 (original)
- **Why:** Email, storage, SMS, and chat integrations are env-var-switchable but
  have no formal interface contract — each integration implements its own ad-hoc
  shape. A capability contract makes providers truly pluggable and testable in
  isolation.
- **Impact:** Cleaner integration surface, easier to swap providers, enforce
  consistent fallback behavior.
- **Acceptance:** Define a capability interface per integration domain (email,
  storage, SMS, chat); refactor existing providers to implement it; add isolated
  adapter tests.
- **Risk:** Low — additive design; existing integrations keep working.

---

### H2 — Remove loyalty/points/referrals/streaks — _Status: Pending_

- **Source:** `docs/MAINTENANCE_FEATURE_AUDIT.md` #1 (Tier 1)
- **Why:** Gamification/loyalty is product-specific growth tooling, not identity
  infrastructure. It is the single largest service in the repo (1,500+ LOC) and
  carries 5 of the 59 DB tables.
- **Impact:** ~1,500 LOC removed, 5 DB tables dropped (, `tiers`,
  `user_tiers`, `redemptions_catalog`, `streaks`), points ledger + referral
  tables also candidates.
- **Files to delete:** `points.service.ts`,
  `streak.service.ts`,
  `dashboard/points`, `dashboard/referrals` mount in `server.ts`;
  nav entries; 5+ drop migrations; points tests.
- **Acceptance:** All loyalty/referral/streak code + tables removed;
  type-check + test suite pass; README updated.
- **Risk:** Medium — self-contained with low coupling; safe to lift.

### H3 — UI component / integration tests — _Status: In Progress (2026-07-01)_

- **Source:** `docs/AUDIT.md` T1, `todo.md` P3.1
- **Why:** `packages/ui` had only `lib/*.test.ts` (plain logic); no component or
  page-level tests, so auth/billing/admin regressions can land silently.
- **Done so far:** happy-dom + Testing Library harness stood up and enforced in
  CI; 11 tests written — `SetupChecklist.test.tsx` (6 cases) and
  `app/(auth)/login/page.test.tsx` (5 cases).
- **Remaining:** Register/reset-password states, org role/invite forms,
  billing/plan gates, admin tables — extend incrementally following the same
  colocated test pattern.
- **Acceptance:** Auth flows covered (register, reset, MFA); org flows covered
  (invite, roles); billing gates covered; admin tables covered.
- **Risk:** Low — test infra in place; no production code changed.
