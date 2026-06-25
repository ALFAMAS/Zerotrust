# Phase 6 — SDK and Release Hardening

Date: 2026-06-25  
Goal: prevent backend API changes from shipping without a regenerated TypeScript SDK.

## Implemented in this phase

| Workstream | Deliverable | Exit criterion |
|---|---|---|
| SDK drift gate | Root script `sdk:check` runs SDK generation and fails if `packages/client/src/index.ts` changes. | Any OpenAPI/SDK mismatch blocks CI. |
| CI release hardening | Main CI runs `bun run sdk:check` after the API/UI integration matrix check. | Backend route/schema changes must keep the SDK committed. |

## Human operating notes

1. When changing `src/api/openapi.json`, run `bun run sdk:generate` locally.
2. Review `packages/client/src/index.ts` diffs as part of the same PR as backend API changes.
3. If a route is intentionally internal-only, keep it out of OpenAPI and document it in the integration matrix notes.
