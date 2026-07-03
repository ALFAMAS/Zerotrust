# zerotrust — TODO

## Audit backlog — verified 2026-07-03

_Synthesized from `docs/AUDIT.md`, `AUDIT-REPORT.md`, `docs/maintenance-scorecard.md`,
`docs/api-ui-integration-matrix.md`, `docs/compliance/`, and a full-repo code scan.
Does not duplicate shipped work in [`tdone.md`](./tdone.md) (P0–P5 complete)._

---

## Open backlog (verified not shipped)

### Product & platform

**T5 — Test coverage ratchet toward 85%**

Measured coverage (2026-07-03, `docs/maintenance-scorecard.md` §3) is API **65.81%**
lines / **58.54%** branches and UI **53.71%** lines — floors are **65/58/53** in
`vitest.config.ts` / `packages/ui/vitest.config.ts`. The long-term target remains
**≥85%** on API and UI.

_Acceptance:_ raise ratchets incrementally as tests land; scorecard §3 trends toward
the 85% target without lowering floors.

**D3 — OpenAPI / SDK schema expansion**

`docs/api-reference.md` notes that some lower-traffic admin, webhook, tenant, and
email-event routes may still need schema-level expansion. The integration matrix
discovers **198** backend routes vs **102** paths in `src/api/openapi.json`; ops
routes such as `/metrics`, `/webhooks/email/event`, and `/ssf/events` are
intentionally absent from the UI but should be documented for SDK consumers when
needed.

_Acceptance:_ expand `openapi.json` for the remaining product-facing routes;
`bun run verify:generated` stays clean.

### Compliance program (operational)

**C1 — SOC 2 Type II auditor engagement**

`docs/compliance/soc2-auditor-readiness.md` lists **Not started** for system
description, auditor selection, and observation-window confirmation. Q3 2026
evidence (E-001–E-010) is complete; external audit scheduling is not.

_Acceptance:_ auditor engaged, observation window set, system description and
engagement letter recorded in `docs/compliance/evidence/`.

---

### Not backlog (verified shipped or intentional)

| Item | Verdict |
| --- | --- |
| P0–P5 audit backlog (repos, worker topology, TanStack Query, ES optional, anchoring, compliance docs) | Shipped — [`tdone.md`](./tdone.md) |
| P1 security & access control (B1 invite accept, B3 re-verification, ALFA-3) | Shipped — [`tdone.md`](./tdone.md) §P1 Security & access control |
| P2 infrastructure backlog (B4 coverage ratchet, B5 queue-backed cron scheduling) | Shipped — [`tdone.md`](./tdone.md) §P2 — Infrastructure backlog |
| P3 Operations & compliance (B6 CI recovery, B7 Q3 evidence) | Shipped — [`tdone.md`](./tdone.md) §P3 — Operations & compliance |
| E2 TanStack Query migration | Complete — `docs/tanstack-query-progress.md` (48/48 data pages) |
| E6 repository layer | Complete — nine repos under `src/db/repositories/` |
| Audit log external anchoring (P5.1) | Shipped — `src/audit/anchor.ts`, migration `0029`, `audit.anchor` job |
| Module boundaries (`audit/anchor.ts` → shared S3 config) | Shipped — [`tdone.md`](./tdone.md) §M4 |
| RSC server prefetch (P3.11 expansion) | Shipped — ten prefetched routes; [`tdone.md`](./tdone.md) §P3.11 |
| Hardware key store (TPM / Secure Enclave / PKCS#11) | Intentional stubs — software-only default; see `src/crypto/hardware-key-store.ts` |
| BFF / httpOnly cookie auth | Fork path only — ADR 008 + `docs/extending.md`; default remains `localStorage` |
| `GET /auth/unsubscribe`, `POST /wallet/spend` UI gaps | SDK-only by design — `docs/api-ui-integration-matrix.md` |
| Telegram Bot integration | Removed — stale config mocks in tests only; not a product surface |
