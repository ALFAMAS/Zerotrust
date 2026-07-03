# zerotrust — TODO

## Audit backlog — verified 2026-07-03

_Synthesized from `docs/AUDIT.md`, `AUDIT-REPORT.md`, `docs/maintenance-scorecard.md`,
`docs/api-ui-integration-matrix.md`, `docs/compliance/`, and a full-repo code scan.
Does not duplicate shipped work in [`tdone.md`](./tdone.md) (P0–P5 complete)._

---

### P3 — Operations & compliance (non-code)

#### B6 — CI success rate recovery

**Status:** Open — operational.

**Evidence:** `docs/maintenance-scorecard.md` §2 — **~42%** success over last 100
runs (Jun 3–Jul 3, Jul 2 refactor burst); target ≥95%. Current test suite green
locally (953 API tests, 2026-07-03).

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
| P1 security & access control (B1 invite accept, B3 re-verification, ALFA-3) | Shipped — [`tdone.md`](./tdone.md) §P1 Security & access control |
| P2 infrastructure backlog (B4 coverage ratchet, B5 queue-backed cron scheduling) | Shipped — [`tdone.md`](./tdone.md) §P2 — Infrastructure backlog |
| E2 TanStack Query migration | Complete — `docs/tanstack-query-progress.md` (48/48 data pages) |
| E6 repository layer | Complete — nine repos under `src/db/repositories/` |
| Audit log external anchoring (P5.1) | Shipped — `src/audit/anchor.ts`, migration `0029`, `audit.anchor` job |
| Hardware key store (TPM / Secure Enclave / PKCS#11) | Intentional stubs — software-only default; see `src/crypto/hardware-key-store.ts` |
| BFF / httpOnly cookie auth | Fork path only — ADR 008 + `docs/extending.md`; default remains `localStorage` |
| `GET /auth/unsubscribe`, `POST /wallet/spend` UI gaps | SDK-only by design — `docs/api-ui-integration-matrix.md` |
