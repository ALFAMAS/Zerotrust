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

### M1 — Reduce `as any` casts (was 213, now 46) — _Status: In Progress (2026-07-01)_

- **Source:** `docs/AUDIT.md` M2
- **Why:** `as any` casts in `src/` are a place the type system stops helping —
  an API shape change fails silently at runtime rather than at compile time.
- **Done so far (109 → 61):** `oauth/providers/google.ts` (userinfo response
  typed); `services/dataRetention.ts` (**found and fixed a real bug** — all 4
  purge functions read `.rowCount` on the postgres-js delete result, but the
  driver actually exposes `.count`, so retention purge logs had silently
  reported 0 rows purged for every run regardless of actual deletions);
  `services/search.service.ts` (typed `db.execute<T>()` row shape);
  `services/region.service.ts` (`residency` config field typed as an honest
  optional extension); `services/emailQueue.ts` (payload casts now use
  `Parameters<typeof fn>[1]`).
  **Second pass (95 → 61)** reused the canonical `User["mfa"]` /
  `DeviceFingerprint` types from `shared/types.ts` for `gdpr.routes.ts`,
  `admin.routes.ts`, `session.routes.ts`; validated `region` query params via
  `isValidRegion()` instead of casting in `search.routes.ts`; replaced two
  controller-monkey-patching SSE cleanup casts (`notification.routes.ts`,
  `api/server.ts`) with a closure variable; added `Logger.mergeContext()` /
  `Logger.indexToElasticsearch()` so `logger/index.ts` and callers no longer
  reach into private fields via `as any`; typed `hono/utils/http-status`'s
  `ContentfulStatusCode` for `apiHelpers.ts`'s `ok()`/`fail()` and
  `errorHandler.ts`'s `jsonError()`; removed a duplicate `getStripe()` in
  `billing.routes.ts` in favor of the one already exported from
  `stripeWebhookProcessor.ts`. **Found and fixed two more instances of the
  same `.rowCount`-vs-`.count` bug**: `emailSuppression.service.ts`'s
  `unsuppressEmail()` (currently unused in production routes) and
  `middleware/sessionControl.ts`'s `revokeAllSessionsForUser()` — the latter
  is user-facing (`DELETE /sessions` and the admin "revoke all sessions"
  action both always reported `revoked: 0` regardless of how many sessions
  were actually revoked). Also found and fixed a real data-loss bug in
  `services/lifecycleEmail.service.ts`: all four lifecycle-email queries
  (D1/D3/D7/D14) selected only `id, email, displayName` — never `metadata` —
  so `(user as any).metadata` was always `undefined`, meaning every lifecycle
  email sent **overwrote the user's entire metadata column**, silently
  wiping unrelated fields (pending account-deletion state, notification
  preferences, customer segment, other lifecycle-sent flags). Fixed by
  selecting `metadata` in all four queries and merging into it instead of
  replacing it; added regression tests
  (`__tests__/lifecycleEmail.service.test.ts`, `__tests__/sessionControl.test.ts`)
  asserting existing fields survive the update.
  **Third pass (61 → 46)**: the risk-decision middleware batch
  (`temporalAccess.ts`, `rateLimiting.ts`, `proofOfPossession.ts`,
  `geoFencing.ts`, `continuousEval.ts`, `deviceAttestation.ts`, 16 casts total)
  turned out to be almost entirely redundant casts — `HonoEnv.Variables` and
  `shared/types.ts`'s `User`/`Session`/`TokenPayload` interfaces already type
  `sessionConfig.scheduleRestriction`, `sessionConfig.allowedCountries`,
  `anomalyFlags`, `deviceFingerprint`, `token.pop_key`, and `tenantId`
  correctly — the `as any` casts were bypassing types that were already
  correct, not working around a real gap. Removed all of them (plus 3 more
  `error.statusCode as any` → `as ContentfulStatusCode`, same pattern as the
  second pass). Ran `/security-review` on the diff before shipping since it
  touches auth-adjacent middleware: no findings — every change is
  compile-time-only (cast removed or narrowed; zero runtime/control-flow
  difference), confirmed by the full 773-test suite passing unchanged.
- **Remaining:** 46 casts across 6 files, all deliberately deferred to a
  dedicated `/security-review`-backed PR (not a mechanical sweep):
  `middleware/auth.ts` (18), `api/routes/auth.routes.ts` (15),
  `api/routes/passkey.routes.ts` (6, WebAuthn), `api/routes/verification.routes.ts`
  (4, WebAuthn), `api/routes/mfa.routes.ts` (3) — these implement or directly
  gate authentication/session/MFA/WebAuthn protocol logic, not just read
  already-typed fields like the middleware batch above, so they need real
  review of the underlying logic, not just a cast swap.
  `services/stripeWebhookProcessor.ts` (2) is a documented exception: Stripe's
  SDK only exposes its bundled API version as a type-level literal and
  doesn't publicly export a type for "any valid version string," so pinning
  an older version can't be expressed without a cast — left in place with a
  comment, not counted against the "fix" list.
- **Acceptance:** Replace `as any` with proper types; start with high-risk areas
  (Stripe webhook body ✅, OAuth provider payloads ✅, SSF event data — none
  found, already clean).
- **Risk:** Low for the files done so far (mechanical, test-verified, three
  real bugs found and fixed along the way; risk-decision middleware batch
  passed `/security-review` with no findings). The remaining
  auth.ts/auth.routes.ts/passkey/verification/mfa pass is higher risk —
  security-critical code implementing auth logic itself, needs its own
  dedicated review.

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

### H3 — UI component / integration tests — _Status: Done (2026-07-01)_

- **Source:** `docs/AUDIT.md` T1, `todo.md` P3.1
- **Why:** `packages/ui` had only `lib/*.test.ts` (plain logic); no component or
  page-level tests, so auth/billing/admin regressions can land silently.
- **Done:** happy-dom + Testing Library harness stood up and enforced in CI;
  grew from 11 to 58 tests across 8 files, all colocated `*.test.tsx` next to
  their component:
  - `SetupChecklist.test.tsx` (6), `app/(auth)/login/page.test.tsx` (5) — prior work
  - `app/(auth)/register/page.test.tsx` (5) — password-mismatch guard, register→login→token
    flow, proof-of-work payload fields, error toast
  - `app/(auth)/reset-password/page.test.tsx` (5) — token read from the URL via
    `useSearchParams`, mismatch guard, success/error states
  - `app/(auth)/forgot-password/page.test.tsx` (3) — request flow, and the
    always-show-confirmation behavior that avoids account-enumeration even on API failure
  - `app/dashboard/organizations/[orgId]/page.test.tsx` (6) — member list, invite
    form gated to admin/owner, invite submission, leave-org with redirect
  - `app/dashboard/billing/page.test.tsx` (9) — plan tiers, current-plan card only
    on paid plans, cancel-reason-required gate, checkout redirect (env-gated Stripe
    price via `vi.stubEnv` + dynamic re-import), success-banner query param
  - `app/admin/users/page.test.tsx` (8) — table render/empty/error states,
    search-triggers-refetch, suspend/activate toggle, delete-with-confirm, invite modal
  - Established a `next/navigation` mock pattern (`useSearchParams`/`useParams`/`useRouter`)
    for pages that weren't previously exercised under the happy-dom harness; confirmed
    Radix `Select`/`Dialog` render fine without interaction (no portal/pointer-capture
    polyfills needed for static assertions).
- **Acceptance:** Auth flows covered (register, reset, forgot-password) ✅; org
  flows covered (invite, roles, leave) ✅; billing gates covered ✅; admin
  tables covered ✅. MFA-specific UI flows are not yet covered — tracked
  separately since MFA UI work should land alongside the deferred MFA/WebAuthn
  backend `as any` pass (see M1) rather than as a standalone test-only PR.
- **Risk:** None realized — test infra in place, no production code changed;
  full UI suite (58 tests, 8 files) and backend suite (773 tests) both green.
