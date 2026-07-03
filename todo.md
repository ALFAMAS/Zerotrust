# zerotrust — TODO

\
## Audit backlog — 2026-07-03

_Synthesized from `docs/AUDIT.md`, `AUDIT-REPORT.md`, `docs/maintenance-scorecard.md`,
`docs/api-ui-integration-matrix.md`, `docs/tanstack-query-progress.md`,
`docs/compliance/`, and a full-repo scan. Does not duplicate shipped work in
[`tdone.md`](./tdone.md)._

_Verified 2026-07-03: **3 open items** (P2 shipped 2026-07-03; P3 shipped 2026-07-03; P4 shipped 2026-07-03; P1.3 removed — duplicate of shipped P3.2
in `tdone.md`; P1.4–P1.5 shipped 2026-07-03)._

### P5 — Compliance and security hardening

- **P5.1 — Audit log external anchoring**
  - **Where:** `docs/compliance/audit-log-anchoring-plan.md` (design only);
    `src/audit/chain.ts`.
  - **Why:** Hash-chain is in-DB; anchoring to object storage/transparency log
    strengthens tamper evidence for SOC 2.
  - **Acceptance:** Scheduled anchor job + verification command + test; evidence
    slot in `docs/compliance/evidence/`.

- **P5.2 — Compliance evidence program (operational)**
  - **Where:** `docs/compliance/README.md` — policies pending approval, vendor
    register TBD, restore drill TBD, incident tabletop TBD, evidence-register open.
  - **Why:** Product controls ship; audit evidence does not.
  - **Acceptance:** Vendor register populated; one restore drill + tabletop
    recorded in `docs/compliance/evidence/YYYY/`; policies approval date set.

- **P5.3 — Hardware key-store providers remain stubs (document/clarify)**
  - **Where:** `src/crypto/hardware-key-store.ts` (TPM / Secure Enclave / PKCS#11
    throw on use); `tdone.md` marks post-quantum `[~]` but no `src/crypto` PQC code.
  - **Why:** README/claims vs implementation gap for security-sensitive forks.
  - **Acceptance:** README + `tdone.md` explicitly "software CSFLE only"; remove or
    relocate `[~]` post-quantum line unless provider code lands.

---
