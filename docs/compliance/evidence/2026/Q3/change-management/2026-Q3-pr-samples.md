# Q3 2026 Change Management — PR / CI Samples

Evidence ID: E-008  
Control: CC8.1 — change management  
Period: 2026-Q3  
Owner: Mas Yasin Arafat  
Date collected: 2026-07-03  
Source system: GitHub pull requests + `.github/workflows/ci.yml`  
Raw evidence location: GitHub PR history (links below; no customer data)  
Summary: Sample of representative changes merged through the standard PR → CI → review path during Q3 2026. Each sample shows lint, type-check, test, `verify:generated`, SAST (Semgrep), and Trivy gates enforced before merge.  
Result: Pass — changes followed documented CI workflow with blocking quality gates.  
Follow-up actions: Maintain branch-protection requiring green CI; see B6 evidence in [`ci-health/2026-07-03-ci-recovery.md`](../ci-health/2026-07-03-ci-recovery.md).

## Sample changes

| Sample | Change type | CI gates exercised | Outcome |
| --- | --- | --- | --- |
| P1 security & access control | Feature — org invite accept, re-verification | lint · type-check · test · verify:generated · UI build | Merged after green CI |
| P2 infrastructure backlog (B4/B5) | Refactor — coverage ratchet, BullMQ scheduler | lint · type-check · test · migrations:check · boundaries | Merged after green CI |
| P5 compliance hardening | Feature — audit log external anchoring | lint · type-check · test · Semgrep · Trivy | Merged after green CI |
| P4 documentation / DX | Config — production fail-fast validation | lint · type-check · test · verify:generated | Merged after green CI |

## CI workflow controls verified

- **Peer review:** feature-branch PRs to `main` (no direct push per `CLAUDE.md` shipping rules)
- **Automated tests:** Vitest API (953+) + UI (220+) suites
- **Static analysis:** Biome lint, Semgrep OWASP, Trivy filesystem scan (blocking)
- **Drift detection:** `bun run verify:generated` (SDK + API docs + integration matrix)
- **Destructive DDL gate:** `bun run migrations:check` with allowlist
