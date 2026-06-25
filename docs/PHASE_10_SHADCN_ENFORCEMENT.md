# Phase 10 — shadcn/ui Enforcement Baseline

Date: 2026-06-25  
Goal: make remaining custom UI drift visible and prevent new untracked drift while migration continues.

## Implemented in this phase

| Workstream | Deliverable | Exit criterion |
|---|---|---|
| UI primitive audit | `scripts/audit-shadcn-adoption.mjs` scans TSX files for raw `button`, `input`, `select`, `table`, and `textarea` outside `components/ui`. | The repo has a committed, reproducible list of remaining migration targets. |
| CI drift check | Main CI runs `bun run ui:audit` and fails when `docs/shadcn-adoption-report.md` is stale. | New raw controls cannot be added silently; the report must be reviewed. |
| Migration baseline | `docs/shadcn-adoption-report.md` records current counts and top target files. | Human/AI agents can split the remaining shadcn migration by file ownership. |

## Current baseline

See `docs/shadcn-adoption-report.md` for the generated count and file list. The next UI-focused PRs should reduce the count; increases require an explicit explanation.
