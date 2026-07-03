# zerotrust — TODO

## Deleted stale docs

| File | Reason |
| --- | --- |
| `AUDIT-REPORT.md` | Fork-readiness snapshot (2026-07-04) claimed the open backlog was empty; superseded by the 2026-07-04 Zero Trust SaaS audit findings below. Shipped work remains in [`tdone.md`](./tdone.md). |
| `docs/ZEROTRUST-SECURITY-AUDIT-2026-07.md` | Prior zero-trust audit (2026-07-03) marked most items fixed and asserted webhook IDOR was not present; contradicted by the senior re-audit (ZT-1). Open work consolidated here; fixed items remain in git history. |

**Still current:** [`docs/AUDIT.md`](./docs/AUDIT.md) (production-readiness standing audit), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/PROJECT_HISTORY.md`](./docs/PROJECT_HISTORY.md), ADRs, [`docs/compliance/`](./docs/compliance/), [`tdone.md`](./tdone.md).

---

## Zero Trust SaaS audit backlog

_Sourced from the 2026-07-04 senior-level Zero Trust SaaS audit (static code review). Does not duplicate shipped work in [`tdone.md`](./tdone.md) or closed items in [`docs/AUDIT.md`](./docs/AUDIT.md)._

**Verification baseline (2026-07-04):** `bun run test` → 1076 API + 242 UI tests (1318 total); migrations through `0034`; SOC 2 observation window active (2026-07-04 — 2027-07-03). Short-term audit backlog (ARCH-1, ARCH-2, MT-1–3, FS-1–2, ZT-3–4) shipped — see [`tdone.md`](./tdone.md).

---

## Long-term (multi-quarter)

- [ ] **MT-1 (RLS)** — **High** — Postgres Row-Level Security as defense-in-depth  
  **Problem:** Application-layer org filters are the only isolation backstop; any missed predicate is a silent cross-tenant leak (see ZT-1).  
  **Fix:** Add RLS policies on high-value org-scoped tables (`billing`, webhooks, support tickets); set `app.org_id` per request from `authMiddleware`.  
  **Paths:** `src/db/schema.ts`, `src/middleware/auth.ts`, `drizzle/` (RLS migrations), `src/db/index.ts`

- [ ] **CP-1 (full)** — **High** — Physical per-region data residency  
  **Problem:** `storageRegion` does not route to separate databases or S3 buckets; all orgs share one Postgres instance and one object-store config.  
  **Fix:** If data residency is a contractual commitment, implement region-sharded storage (separate DB/bucket per region, request routed by org `storageRegion`).  
  **Paths:** `src/services/ops/region.service.ts`, `src/config/index.ts`, `docs/deployment.md`, `docs/reference-architecture.md`

- [ ] **DI-1** — **Low** — Monolithic schema file  
  **Problem:** All tables in one `schema.ts` — merge-conflict and navigation cost.  
  **Fix:** Split by domain (`schema/identity.ts`, `schema/billing.ts`, etc.) re-exported from `schema/index.ts`, mirroring `services/` domain regrouping.  
  **Paths:** `src/db/schema.ts`, `src/db/index.ts`

- [ ] **FS-3** — **Low** — Read-modify-write race on passkey JSONB arrays  
  **Problem:** `registerPasskey()` reads `usersTable.passkeys`/`mfa` then writes full array with no `SELECT … FOR UPDATE` or atomic JSONB append — concurrent registrations can lose a passkey silently.  
  **Fix:** Row lock before read, or atomic `jsonb || jsonb` append in SQL.  
  **Paths:** `src/db/repositories/passkeys.repository.ts`

- [ ] **DQ-2** — **Low** — Test coverage below stated 85% target  
  **Problem:** API coverage ratchet ~67% lines / 60% branches / 65% statements; UI ~55% lines vs 85% long-term aspiration in `docs/maintenance-scorecard.md`. Historical 30-day CI success ~42% (remediated 2026-07-03).  
  **Fix:** Continue incremental ratchet in `vitest.config.ts` / `packages/ui/vitest.config.ts`; raise floors over time.  
  **Paths:** `vitest.config.ts`, `packages/ui/vitest.config.ts`, `docs/maintenance-scorecard.md`, `.github/workflows/ci.yml`

- [ ] **ZT-3 (BFF)** — **Medium** — Full BFF / httpOnly-cookie auth pattern  
  **Problem:** `localStorage` token storage remains XSS-readable; strongest posture requires same-origin cookie session (ADR 008 Option B).  
  **Fix:** Implement BFF proxy (Next.js route handlers issue `httpOnly` session cookies; API tokens never reach browser JS) for deployments needing maximum XSS resistance.  
  **Paths:** `packages/ui/src/lib/auth.ts`, `packages/ui/src/lib/apiClient.ts`, `docs/adr/008-token-storage-design-revisit.md`, `docs/extending.md`

- [ ] **ARCH-3** — **Low** — Dead geo/temporal middleware creates enforcement ambiguity  
  **Problem:** `geoFencingMiddleware()` and `temporalAccessMiddleware()` are mounted only on the `/protected` demo endpoint; org-level country restriction is enforced separately via `sessionPolicy.service.ts` inside `authMiddleware`. Two implementations, only one live — nothing marks the other as legacy.  
  **Fix:** Delete unused middleware or apply to real routes; fold unique logic into `sessionPolicy.service.ts`.  
  **Paths:** `src/middleware/geoFencing.ts`, `src/middleware/temporalAccess.ts`, `src/api/server.ts`, `src/services/auth/sessionPolicy.service.ts`

- [ ] **CP-2** — **Low** — GDPR export incomplete for Art. 15 "all personal data"  
  **Problem:** `GET /gdpr/export` omits wallet transactions, support tickets, feedback, notifications, passkey metadata; audit log query filters `actorId` only, not `targetId`.  
  **Fix:** Extend export to all `userId`-scoped tables; include audit rows where user is target.  
  **Paths:** `src/api/routes/gdpr.routes.ts`

---

## Not backlog (verified shipped or intentional)

| Item | Verdict |
| --- | --- |
| P0–P5 production-readiness audit (`docs/AUDIT.md`) | Shipped — [`tdone.md`](./tdone.md) |
| Repository layer, worker topology, module boundaries, webhook idempotency | Shipped — [`tdone.md`](./tdone.md) |
| TanStack Query migration (48/48 data pages) | Complete — [`docs/tanstack-query-progress.md`](./docs/tanstack-query-progress.md) |
| Audit log external anchoring (P5.1) | Shipped — `src/audit/anchor.ts`, migration `0029` |
| Apple Sign In OAuth | Deferred — no `src/oauth/providers/apple.ts` |
| BFF / httpOnly cookie auth (default) | Fork path — ADR 008 Option B; Option C (in-memory + httpOnly refresh) shipped as ZT-3 |
| `GET /auth/unsubscribe`, `POST /wallet/spend` UI gaps | SDK-only by design — `docs/api-ui-integration-matrix.md` |
