# Phase 8 — Reproducible Toolchain Pinning

Date: 2026-06-25  
Goal: remove CI drift caused by floating runtime versions.

## Implemented in this phase

| Workstream | Deliverable | Exit criterion |
|---|---|---|
| Bun runtime pin | Added `.bun-version` with the repository-supported Bun version. | Local and CI installs use the same Bun runtime. |
| Workflow consistency | CI, staging validation, and DR workflows read Bun from `.bun-version` instead of `latest`. | Future Bun upgrades are explicit PRs instead of surprise CI changes. |

## Upgrade procedure

1. Update `.bun-version`.
2. Run `bun install --frozen-lockfile`, `bun run test`, and `bun run build` in a clean environment.
3. Record any lockfile or generated-output changes in the same PR.
4. Run the staging validation workflow before merging the runtime upgrade.
