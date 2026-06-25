# Deliverable 3 — Performance sub-plan (auth/org hot path → p95 < 100 ms)

Companion to `docs/audit/2026-06-25-production-readiness-audit.md` (§3, §6.2).
This breaks the remaining latency work into owned, measurable tasks. The
prerequisite — **a working `/metrics` p95 histogram** — shipped in #39, so every
task below is now measurable rather than guessed.

## What already shipped (#39)

- ✅ **Write-on-every-read eliminated** — `authMiddleware` no longer issues an
  `UPDATE sessions.last_activity_at` per request (throttled to ≤1/60 s). This was
  the single largest p95 contributor on read endpoints.
- ✅ **`/metrics` records `zerotrust_request_duration_seconds`** — p95 is now a
  PromQL query, not a guess.
- ✅ **Effective session policy is cached** (60 s in-memory, invalidated on policy
  write) — confirmed already present in `sessionPolicy.service.ts`.
- ✅ **Hot-path DB indexes** landed via PR #38 (`drizzle/0019_hot_path_indexes.sql`).

After these, a typical authenticated request makes **2 indexed DB round-trips**:
the session lookup and the user lookup.

## Remaining tasks

| # | Task | Owner | Risk | Measurable target |
|---|------|-------|------|-------------------|
| T1 | Fold session + user into **one JOIN** in `authMiddleware` | AI (impl) + human (DB validation) | **Med** — auth-critical; needs real-DB integration tests | 2 → **1** round-trip/request |
| T2 | Optional **short-TTL Redis cache** of user auth-state, keyed by `uid` | AI | **Med** — staleness of suspend/role; needs invalidation | 1 → **0** round-trips on warm hit |
| T3 | Capture **before/after p95** under k6 on staging | human (deploy) + AI (analysis) | Low | record in audit §7 |

### T1 — session+user JOIN (recommended first; always-fresh, no cache staleness)

`src/middleware/auth.ts` currently runs:
```ts
const sessionRows = await db.select().from(sessionsTable).where(and(
  eq(sessionsTable.tokenId, payload.jti), eq(sessionsTable.userId, payload.sub),
  eq(sessionsTable.isActive, true))).limit(1);
// ...later...
const userRows = await db.select().from(usersTable).where(eq(usersTable.id, payload.sub)).limit(1);
```
Replace with a single `innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))`
selecting both row shapes, then map `row.sessions` / `row.users` into the existing
`c.set("user"|"session", …)` calls. No behavior change, one fewer round-trip,
**always fresh** (no cache-invalidation surface).

**Why a human must validate:** this rewrites the core auth read. The unit suites
mock `getDb`, so a real-DB integration run is required (`bun run test` against the
CI Postgres, or staging). Acceptance: every existing `auth.routes` / `middleware`
test stays green, and a tampered/expired/revoked token still 401s.

### T2 — Redis user auth-state cache (only after T1, if p95 still misses)

Cache `{ status, roles }` per `uid` in Redis with a **5–10 s TTL** behind the
existing `services/rateLimiter/redis.ts` client (in-memory fallback already
exists). **Must** be invalidated on: suspend/delete, role change, password reset,
and session revoke — wire `del(uid)` into those mutations. Keep the TTL short:
this trades a bounded staleness window for the read saving, and auth-state
staleness is security-sensitive (a suspended user could linger for the TTL).

### T3 — measurement (staging)

```
curl -s "$BASE_URL/metrics" | grep zerotrust_request_duration_seconds   # sanity
k6 run -e BASE_URL=$BASE_URL tests/load/full-suite.k6.js
# p95 for auth/org:
#   histogram_quantile(0.95, sum(rate(zerotrust_request_duration_seconds_bucket{route=~"/auth.*|/orgs.*"}[5m])) by (le))
```
Run against the pre-change image and this branch; record both in the audit §7
ledger. **Exit:** p95 < 100 ms for `/auth/*` and `/orgs/*` under the standard k6
profile.

## Milestones

- **M1 (this week):** T1 implemented + validated on CI Postgres → merged.
- **M2:** T3 baseline+after captured on staging; if p95 < 100 ms, **stop** (don't
  add T2's cache complexity unless the number demands it — speed work should be
  driven by the measured histogram, not by adding caches speculatively).
- **M3:** only if needed, T2 with invalidation + a staleness-window test.
