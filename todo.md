# zerotrust — TODO

## Audit backlog — verified 2026-07-03

_Synthesized from `docs/AUDIT.md`, `AUDIT-REPORT.md`, `docs/maintenance-scorecard.md`,
`docs/api-ui-integration-matrix.md`, `docs/compliance/`, and a full-repo code scan.
Does not duplicate shipped work in [`tdone.md`](./tdone.md) (P0–P5 complete)._

---

### P1 — Security & access control gaps

#### B4 — Test coverage ratchet toward 85%

**Status:** Open — long-term target; ratchets below goal.

**Evidence:** `docs/maintenance-scorecard.md` §3 — API **64.1%** lines / **56.2%**
branches (floors 64/56 in `vitest.config.ts`); UI **~47%** lines
(`packages/ui/vitest.config.ts`). 892 API + 216 UI tests pass (2026-07-03).

**Acceptance criteria:**

- Raise Vitest coverage floors incrementally as measured coverage grows (target
  ≥85% lines/branches long-term per scorecard).
- Prioritize untested hot paths: auth flows, billing webhooks.

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
| B1 `POST /orgs/invites/accept` missing + ALFA-3 invite visibility/notifications | Shipped — [`tdone.md`](./tdone.md) Organizations & Teams |
| E2 TanStack Query migration | Complete — `docs/tanstack-query-progress.md` (48/48 data pages) |
| E6 repository layer | Complete — nine repos under `src/db/repositories/` |
| Audit log external anchoring (P5.1) | Shipped — `src/audit/anchor.ts`, migration `0029`, `audit.anchor` job |
| Hardware key store (TPM / Secure Enclave / PKCS#11) | Intentional stubs — software-only default; see `src/crypto/hardware-key-store.ts` |
| BFF / httpOnly cookie auth | Fork path only — ADR 008 + `docs/extending.md`; default remains `localStorage` |
| `GET /auth/unsubscribe`, `POST /wallet/spend` UI gaps | SDK-only by design — `docs/api-ui-integration-matrix.md` |
