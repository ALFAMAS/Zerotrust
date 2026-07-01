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


## Medium — Moderate effort, high maintainability payoff

### M1 — Reduce `as any` casts (was 213, now 95) — _Status: In Progress (2026-07-01)_

- **Source:** `docs/AUDIT.md` M2
- **Why:** `as any` casts in `src/` are a place the type system stops helping —
  an API shape change fails silently at runtime rather than at compile time.
- **Done so far (109 → 95):** `oauth/providers/google.ts` (userinfo response
  typed); `services/dataRetention.ts` (**found and fixed a real bug** — all 4
  purge functions read `.rowCount` on the postgres-js delete result, but the
  driver actually exposes `.count`, so retention purge logs had silently
  reported 0 rows purged for every run regardless of actual deletions; fixed
  the property name + the test mock that shared the same wrong assumption);
  `services/search.service.ts` (typed `db.execute<T>()` row shape);
  `services/region.service.ts` (`residency` config field typed as an honest
  optional extension — it doesn't exist in the schema and the check is
  currently dead code; `setOrgBranding`'s cast now uses the column's real
  `OrgBranding` type); `services/emailQueue.ts` (payload casts now use
  `Parameters<typeof fn>[1]` so they track each target function's real
  signature).
- **Remaining:** 95 casts across ~35 files. **`middleware/auth.ts` (18) and
  `api/routes/auth.routes.ts` (15) are the largest concentration (33 of 95)
  and are deliberately deferred** — auth-critical code needs its own
  dedicated PR with a `/security-review` pass, not a bundled mechanical sweep.
  Next-largest: `middleware/deviceAttestation.ts` (5), `services/lifecycleEmail.service.ts` (4),
  `api/routes/passkey.routes.ts` (6), `api/routes/verification.routes.ts` (4),
  `api/routes/session.routes.ts` (4).
- **Acceptance:** Replace `as any` with proper types; start with high-risk areas
  (Stripe webhook body ✅, OAuth provider payloads ✅, SSF event data — none
  found, already clean).
- **Risk:** Low for the files done so far (mechanical, test-verified). The
  deferred `auth.ts`/`auth.routes.ts` pass is higher risk — security-critical
  code, needs its own review.

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
