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

### M2 — Plugin/capability contract for optional-heavy integrations — _Status: Done (2026-07-01)_

- **Source:** `todo.md` P3.4 (original)
- **Rescoped:** The original acceptance criteria named email, storage, SMS, and
  chat as domains needing a capability interface. On inspection: SMS/Twilio has
  already been fully removed from the codebase; `email.service.ts` is a single
  generic `nodemailer` SMTP transport with no per-provider branching;
  `objectStorage.service.ts` is already fully provider-agnostic via the
  S3-compatible protocol (AWS/B2/R2/MinIO/Wasabi switch purely on env config,
  no per-provider code paths). None of those three exhibit the "ad-hoc
  per-provider shape" problem this item describes. The one genuine instance was
  `src/notifications/dispatcher.ts`'s `sendToChannel`, which if/else-branched on
  `channel.type` ("slack" | "teams" | "pagerduty") with three near-duplicate
  private send methods baked into the dispatcher class.
- **Done:** Added `NotificationAdapter` capability interface
  (`src/notifications/types.ts`) — `{ type, send(config, event, data) }`.
  Extracted each provider into its own adapter module under
  `src/notifications/adapters/` (`slack.ts`, `teams.ts`, `pagerduty.ts`), each
  owning its own formatting call + `fetchPublicUrl`/`fetchFixedUrl` (CWE-918
  guard preserved verbatim per provider). `adapters/index.ts` exports a
  `defaultAdapters` registry (`Map<type, NotificationAdapter>`).
  `NotificationDispatcher` now takes an optional adapter map in its
  constructor (defaults to `defaultAdapters`) and looks up `sendToChannel` by
  `channel.type` instead of branching — unknown types are a no-op instead of a
  silent branch fallthrough. Added isolated adapter tests
  (`src/__tests__/notifications.adapters.test.ts` — payload shape, non-2xx
  handling, SSRF-guard rejection per provider) and dispatcher registry tests
  (`src/__tests__/notifications.dispatcher.test.ts` — routing, missing-adapter
  no-op, one-channel-failure-doesn't-block-others, enabled/event filtering)
  using fake injected adapters, no network mocking needed.
- **Impact:** Adding a new chat/alerting provider (e.g. Discord, Opsgenie) is
  now "write one adapter module + register it," with no dispatcher changes.
  Adapters are unit-testable without the dispatcher or a live webhook.
- **Risk:** None realized — additive/behavior-preserving; full test suite (768
  tests) and type-check pass unchanged.

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
