# zerotrust — TODO

\
## Audit backlog — 2026-07-03

_Synthesized from `docs/AUDIT.md`, `AUDIT-REPORT.md`, `docs/maintenance-scorecard.md`,
`docs/api-ui-integration-matrix.md`, `docs/tanstack-query-progress.md`,
`docs/compliance/`, and a full-repo scan. Does not duplicate shipped work in
[`tdone.md`](./tdone.md)._

_Verified 2026-07-03: **10 open items** (P2 shipped 2026-07-03; P3 shipped 2026-07-03; P1.3 removed — duplicate of shipped P3.2
in `tdone.md`; P1.4–P1.5 shipped 2026-07-03)._

### P4 — Documentation and developer experience

- **P4.6 — Fix Trivy CI gate (currently non-blocking)**
  - **Where:** `.github/workflows/ci.yml` (`continue-on-error: true` on Trivy;
    `docs/deployment.md` notes broken binary install).
  - **Why:** Filesystem CVE scan provides no signal when install fails before scan.
  - **Acceptance:** Pin working `trivy-action`/binary combo; flip to blocking or
    remove job; scorecard §7 security exceptions updated.

- **P4.7 — Resolve Semgrep SAST exception**
  - **Where:** `.github/workflows/ci.yml`, `docs/maintenance-scorecard.md` §7
    (SAST-Semgrep triaged Low, opened 2026-06).
  - **Why:** Open security exception on scorecard.
  - **Acceptance:** Semgrep green on `main` or findings documented/suppressed with
    rationale; scorecard row closed.

- **P4.8 — Populate maintenance scorecard TBD baselines**
  - **Where:** `docs/maintenance-scorecard.md` (CI success rate, flaky tests,
    E2E, k6, backup drill, prod latency — all _TBD_).
  - **Why:** P4.4 created template; most rows never filled.
  - **Acceptance:** At least CI duration + test count + migration count filled
    from GitHub Actions; quarterly review date set.

- **P4.9 — ADR 008 fork path: optional BFF/httpOnly token storage** _(intentionally unshipped in default template)_
  - **Where:** `docs/adr/008-token-storage-design-revisit.md`,
    `packages/ui/src/lib/auth.ts`, `apiClient.ts` (no `app/api/auth/` BFF route).
  - **Why:** ADR 008 accepts `localStorage` default; forks needing httpOnly cookies
    lack a documented or optional BFF implementation path.
  - **Acceptance:** Either ship optional `app/api/auth/[...path]/route.ts` BFF
    behind `NEXT_PUBLIC_BFF_AUTH=true`, or add `docs/extending.md` §BFF migration
    checklist (explicit non-default).

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
