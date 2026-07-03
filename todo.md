# zerotrust — TODO

## Audit backlog — verified 2026-07-04

_Synthesized from `docs/AUDIT.md`, `AUDIT-REPORT.md`, `docs/maintenance-scorecard.md`,
`docs/api-ui-integration-matrix.md`, `docs/compliance/`, and a full-repo code scan.
Does not duplicate shipped work in [`tdone.md`](./tdone.md) (P0–P5 complete)._

**Verification (2026-07-04):** `bun run test` → **1003 API** tests (121 files);
`NODE_ENV=test bun run --cwd packages/ui test` → **239 UI** tests (60 files);
nine repos under `src/db/repositories/`; migration `0029_audit_log_anchors`;
TanStack Query migration **48/48** data pages (`docs/tanstack-query-progress.md`);
`scripts/audit-api-ui-map.mjs` → **0** unmatched frontend calls, **2** intentional
SDK-only routes; SOC 2 observation window active (E-011–E-013).

---

## Open backlog (verified not shipped)

_No open product or compliance backlog items._

All formal audit-program tickets are closed. Incremental maintenance targets
(coverage toward ≥85%, rolling CI success ≥95%) are **not** backlog tickets — they
live in [`docs/maintenance-scorecard.md`](./docs/maintenance-scorecard.md) §2–§3.

---

### Not backlog (verified shipped or intentional)

| Item | Verdict |
| --- | --- |
| P0–P5 audit backlog (repos, worker topology, TanStack Query, ES optional, anchoring, compliance docs) | Shipped — [`tdone.md`](./tdone.md) |
| P1 security & access control (B1 invite accept, B3 re-verification, ALFA-3) | Shipped — [`tdone.md`](./tdone.md) §P1 Security & access control |
| P2 infrastructure backlog (B4 coverage ratchet, B5 queue-backed cron scheduling) | Shipped — [`tdone.md`](./tdone.md) §P2 — Infrastructure backlog |
| P3 Operations & compliance (B6 CI recovery, B7 Q3 evidence) | Shipped — [`tdone.md`](./tdone.md) §P3 — Operations & compliance |
| T5 test coverage ratchet program | Shipped 2026-07-04 — CI gates `test:coverage` + `test:coverage:ui`; see [`tdone.md`](./tdone.md) §T5 |
| C1 SOC 2 Type II auditor engagement | Shipped 2026-07-04 — observation window 2026-07-04 — 2027-07-03; [`tdone.md`](./tdone.md) §C1 |
| E2 TanStack Query migration | Complete — `docs/tanstack-query-progress.md` (48/48 data pages) |
| E6 repository layer | Complete — nine repos under `src/db/repositories/` |
| Audit log external anchoring (P5.1) | Shipped — `src/audit/anchor.ts`, migration `0029`, `audit.anchor` job |
| Module boundaries (`audit/anchor.ts` → shared S3 config) | Shipped — [`tdone.md`](./tdone.md) §M4 |
| RSC server prefetch (P3.11 expansion) | Shipped — ten prefetched routes; [`docs/ui-http-client.md`](./docs/ui-http-client.md) |
| Apple Sign In OAuth | Deferred — Google/GitHub/Facebook ship; no `src/oauth/providers/apple.ts` |
| Hardware key store (TPM / Secure Enclave / PKCS#11) | Intentional stubs — software-only default; see `src/crypto/hardware-key-store.ts` |
| BFF / httpOnly cookie auth | Fork path only — ADR 008 + `docs/extending.md`; default remains `localStorage` |
| `GET /auth/unsubscribe`, `POST /wallet/spend` UI gaps | SDK-only by design — `docs/api-ui-integration-matrix.md` |
| Telegram Bot integration | Removed — stale config mocks in tests only; not a product surface |
| Test coverage ≥85% long-term | Maintenance ratchet — T5 program shipped; floors raised incrementally via scorecard §3 |
| Rolling CI success ≥95% (30-day) | Ops metric — B6 remediation applied 2026-07-03; scorecard §2 rebaseline in progress |
