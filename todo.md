# zerotrust — TODO

## Audit backlog — verified 2026-07-03

_Synthesized from `docs/AUDIT.md`, `AUDIT-REPORT.md`, `docs/maintenance-scorecard.md`,
`docs/api-ui-integration-matrix.md`, `docs/compliance/`, and a full-repo code scan.
Does not duplicate shipped work in [`tdone.md`](./tdone.md) (P0–P5 complete)._

---

### P0 — Correctness (broken shipped surfaces)

#### B1 — `POST /orgs/invites/accept` backend route missing

**Status:** Open — UI calls a route that does not exist.

**Evidence:** `packages/ui/src/app/invite/[token]/page.tsx` and
`packages/ui/src/lib/server-state/organizations.ts` (`ORG_INVITES_ACCEPT_PATH`) POST
to `/orgs/invites/accept`. `src/api/routes/org.routes.ts` has create/list/revoke
invites under `/:orgId/invites` but no accept handler. Listed as unmatched in
`docs/api-ui-integration-matrix.md`. No route tests cover accept.

**Acceptance criteria:**

- Add `POST /orgs/invites/accept` (token in body) that validates the invite,
  checks the authenticated user's email, creates membership, and marks the invite
  consumed.
- Document in `openapi.json` / regenerate SDK.
- Route tests + integration-matrix regen show zero unmatched for this path.
- `/invite/[token]` page accepts successfully in manual or E2E test.

---

#### B2 — Apple OAuth adapter not wired in provider factory

**Status:** Open — provider module exists but factory rejects `apple`.

**Evidence:** `src/oauth/providers/apple.ts` implements `exchangeCode`, but
`getProviderAdapter()` in `src/oauth/provider.factory.ts` has no `case "apple"` and
falls through to `UNSUPPORTED_OAUTH_PROVIDER`. README and `tdone.md` claim Apple
OAuth ships.

**Acceptance criteria:**

- Add `case "apple"` in `getProviderAdapter()` delegating to `./providers/apple.js`.
- Provider tests cover the factory wiring.
- Admin auth settings can enable Apple when credentials are configured.

---

### P1 — Security & access control gaps

#### B3 — Continuous access re-verification not integrated end-to-end

**Status:** Open — backend primitives exist; not mounted or surfaced in UI.

**Evidence:** `requireReverification()` in `src/middleware/continuousVerification.ts`
and `/auth/verify/*` routes in `verification.routes.ts` exist, but
`requireReverification` is never mounted on any route (only re-exported from
`src/index.ts`). No UI handler for `REVERIFICATION_REQUIRED` or
`/auth/verify/challenge`. `tdone.md` overstates this as fully shipped.

**Acceptance criteria:**

- Mount `requireReverification({ sensitiveOperation: true })` on agreed sensitive
  routes (password change, MFA disable, org transfer, billing cancel, etc.).
- UI intercepts `REVERIFICATION_REQUIRED` (apiClient or mutation error boundary),
  runs challenge/respond flow, and retries the original action.
- Route + UI tests cover at least one sensitive path end-to-end.

---

### P2 — Quality & maintainability

#### B4 — Test coverage ratchet toward 85%

**Status:** Open — long-term target; ratchets below goal.

**Evidence:** `docs/maintenance-scorecard.md` §3 — API **64.1%** lines / **56.2%**
branches (floors 64/56 in `vitest.config.ts`); UI **~47%** lines
(`packages/ui/vitest.config.ts`). 892 API + 216 UI tests pass (2026-07-03).

**Acceptance criteria:**

- Raise Vitest coverage floors incrementally as measured coverage grows (target
  ≥85% lines/branches long-term per scorecard).
- Prioritize untested hot paths: auth flows, billing webhooks, org invite accept
  (B1), continuous verification (B3).

---

#### B5 — Queue-backed cron scheduling (scale-out path)

**Status:** Open — mitigated, not fully implemented.

**Evidence:** `src/jobs/registry.ts` declares jobs with Zod schemas and idempotency
keys; `src/jobs/scheduler.ts` still uses `setInterval` + Redis leader lock (no
BullMQ cron, dead-letter, or retry/backoff for scheduled jobs). `WORKER_MODE` +
dedicated worker (`src/worker.ts`) mitigates duplicate execution in production.
`AUDIT-REPORT.md` E5 documents this as acceptable for a starter template.

**Acceptance criteria:**

- Scheduled jobs dispatch through BullMQ (or equivalent) with retry/backoff and
  dead-letter visibility.
- Scheduler unit tests prove idempotent replay and failure recovery.
- `docs/deployment.md` documents the queue-backed topology.

---

### P3 — Operations & compliance (non-code)

#### B6 — CI success rate recovery

**Status:** Open — operational.

**Evidence:** `docs/maintenance-scorecard.md` §2 — **~42%** success over last 100
runs (Jun 3–Jul 3, Jul 2 refactor burst); target ≥95%. Current test suite green
locally (892 API tests, 2026-07-03).

**Acceptance criteria:**

- Identify and fix recurring CI failure modes (lint, type-check, generated drift).
- Scorecard §2 success rate ≥95% over a 30-day window.

---

#### B7 — Compliance evidence collection (Q3 2026)

**Status:** Open — operational; tooling ships, evidence folders empty.

**Evidence:** `docs/compliance/evidence-register.md` — E-002, E-003, E-007, E-008,
E-010 still **Not started**. E-001, E-004–E-006, E-009 complete (2026-07-03).
`soc2-auditor-readiness.md` checklist partially stale vs evidence register.

**Acceptance criteria:**

- Complete quarterly access review (E-002) via `/admin/access-reviews`.
- Record onboarding/offboarding samples (E-003), monitoring packet (E-007),
  change-management PR samples (E-008), and annual risk assessment export (E-010)
  under `docs/compliance/evidence/`.
- Update evidence register and `soc2-auditor-readiness.md` statuses.

---

### Not backlog (verified shipped or intentional)

| Item | Verdict |
| --- | --- |
| P0–P5 audit backlog (repos, worker topology, TanStack Query, ES optional, anchoring, compliance docs) | Shipped — [`tdone.md`](./tdone.md) |
| E2 TanStack Query migration | Complete — `docs/tanstack-query-progress.md` (48/48 data pages) |
| E6 repository layer | Complete — nine repos under `src/db/repositories/` |
| Audit log external anchoring (P5.1) | Shipped — `src/audit/anchor.ts`, migration `0029`, `audit.anchor` job |
| Hardware key store (TPM / Secure Enclave / PKCS#11) | Intentional stubs — software-only default; see `src/crypto/hardware-key-store.ts` |
| BFF / httpOnly cookie auth | Fork path only — ADR 008 + `docs/extending.md`; default remains `localStorage` |
| `GET /auth/unsubscribe`, `POST /wallet/spend` UI gaps | SDK-only by design — `docs/api-ui-integration-matrix.md` |
