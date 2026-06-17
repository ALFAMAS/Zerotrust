# ZeroAuth Performance Analysis

_Analysis date: 2026-06-13 — no code changes were made as part of this report._

## TL;DR

This codebase is a **monolithic Hono REST API** (`src/`) with a **Next.js
browser client** (`packages/ui/`). The real performance ceiling is set by
**database round-trips on hot auth paths**, not by transport or
serialization.

## Findings (verified against source)

Ranked by impact-to-effort.

### Tier 1 — auth-path scaling (highest ROI)

| #   | Issue                                                                                                                                        | Location                                                                                                         | Impact                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | **Passkey auth N+1** — loads the entire `users` table and scans in JS to match `credentialId`                                                | `src/api/routes/passkey.routes.ts:256-268`; `passkeys` is a `jsonb` column with no index (`src/db/schema.ts:35`) | O(n) over all users per passkey login; degrades linearly with user count        |
| 2   | **Session validation hits Postgres on every protected request** — 3 sequential queries: session select, user select, `lastActivityAt` update | `src/middleware/auth.ts:45`, `:75`, `:142`                                                                       | 3 DB round-trips × every authenticated request; the dominant throughput limiter |
| 3   | **Sequential session revocation** — one `UPDATE` per session in a loop                                                                       | `src/middleware/sessionControl.ts:25-32`                                                                         | N round-trips when enforcing max-device limits                                  |

### Tier 2 — batch / index cleanups

| #   | Issue                                                                                                                                                                             | Location                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 4   | Billing lifecycle does per-subscription DB lookup + **direct** email send in a loop (bypasses the BullMQ queue)                                                                   | `src/services/billingLifecycle.service.ts:83-112` |
| 5   | Admin broadcast sends emails sequentially                                                                                                                                         | `src/api/routes/admin-tools.routes.ts:295-302`    |
| 6   | Missing indexes: `sessions(userId, isActive)`, `sessions(expiresAt, isActive)`, `subscriptions(status)`, `notifications(userId, read)`, `auditLogs(timestamp)`, `apiKeys(userId)` | `src/db/schema.ts`                                |
| 7   | OAuth state held in an unbounded in-memory `Map`; TTL cleanup only on access                                                                                                      | `src/api/routes/auth.routes.ts`                   |

### Tier 3 — client / UI

| #   | Issue                                                                                                     | Location                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 8   | 30s polling for notifications and status, even though the API already exposes WebSocket/SSE notifications | `packages/ui/.../NotificationBell.tsx`, `status/page.tsx`; server side `src/api/routes/notification.routes.ts` |
| 9   | No client-side request dedup/caching (no SWR/React Query); each component refetches on mount              | `packages/ui/src/lib/api.ts`                                                                                   |
| 10  | No retry/backoff or timeout in the fetch wrapper                                                          | `packages/ui/src/lib/api.ts`                                                                                   |

---

## Implementation plan (Tier 1 — for review before coding)

The two riskiest items touch the auth path, so here is the proposed approach.
**No code has been written yet.**

### A. Redis session cache in auth middleware (`src/middleware/auth.ts`)

**Goal:** Eliminate 2 of the 3 per-request DB round-trips.

1. On successful session validation, cache a minimal session+user snapshot in
   Redis under `session:{tokenId}` with a short TTL (e.g. 60s, capped at the
   session's `expiresAt`).
2. On each request, read the cache first; on hit, skip the session and user
   `SELECT`s. On miss, fall back to the current DB path and repopulate.
3. **Invalidation is the critical correctness concern.** Any revocation path
   (`revokeSession`, `revokeAllSessionsForUser`, `enforceMaxConcurrentDevices`,
   logout, suspension/deletion) must `DEL` the relevant `session:*` key(s) so a
   revoked token cannot survive in cache. Short TTL bounds the blast radius if
   an invalidation is ever missed.
4. **`lastActivityAt` write** (`auth.ts:142`): debounce — only write to
   Postgres if more than N seconds have elapsed since the cached
   `lastActivityAt`, instead of on every request.
5. Reuse the existing `ioredis` client; degrade gracefully to the current
   all-DB path when Redis is unavailable (same pattern as rate limiting).

**Risk:** medium — stale-session-after-revocation is the failure mode.
Mitigated by explicit invalidation + short TTL. Needs tests covering
revoke-then-request and expiry.

### B. Passkey table normalization (`schema.ts`, `passkey.routes.ts`)

**Goal:** Turn the O(n) table scan into an indexed point lookup.

1. Add a `passkeys` table: `(id, userId FK, credentialId UNIQUE, publicKey,
counter, transports, createdAt)`, indexed on `credentialId`.
2. Migration to backfill from the existing `users.passkeys` jsonb arrays.
3. Rewrite authentication to `SELECT ... WHERE credentialId = ?` (one indexed
   row) instead of scanning all users (`passkey.routes.ts:256`).
4. Update registration and the passkey-list endpoints to write/read the new
   table; keep the jsonb column temporarily for rollback safety, then drop it
   in a follow-up migration once verified.

**Risk:** medium — schema migration + data backfill. Recommend shipping the
table + dual-write first, cut reads over, then remove the jsonb column.

### C. Batch session revocation (`sessionControl.ts:25`)

Replace the loop with a single `db.update(...).where(inArray(sessionsTable.id,
ids))`. Low risk; straightforward.

---

## Suggested sequencing

1. **C** (batch revoke) + the Tier 2 indexes — small, safe, immediate wins.
2. **A** (Redis session cache) — biggest throughput gain; needs careful
   invalidation + tests.
3. **B** (passkey normalization) — schema migration; do behind dual-write.
4. Tier 3 UI work as a separate front-end effort.
