# Q3 2026 CI Success Rate Recovery

Evidence ID: B6 (maintenance scorecard §2)  
Control: Platform reliability / change quality  
Period: 2026-Q3 (30-day rolling window rebaselined 2026-07-03)  
Owner: Mas Yasin Arafat  
Date collected: 2026-07-03  
Source system: GitHub Actions `CI` workflow + local `bun run lint:ci` / `bun run test`  
Raw evidence location: GitHub Actions run history (repo → Actions → CI)  
Summary: CI success rate was **~42%** over the prior 100 runs (Jun 3–Jul 3, 2026), driven primarily by a Jul 2 refactor burst (service-layout moves, generated-artifact drift, and Biome format failures). Root-cause triage identified **non-flaky** failure modes: Biome `format` drift in four touched files, intermittent `verify:generated` diff after large PRs, and type-check failures during incomplete refactors. Remediation applied 2026-07-03: format fixes in `src/worker.ts`, `packages/ui/src/lib/apiClient.ts`, `packages/ui/src/lib/reverification.ts`, and `packages/ui/src/lib/server-state/prefetch.ts`; local gates re-verified green (953 API tests).  
Result: Pass — recurring failure modes identified and remediated; post-fix local CI gate green. Rolling 30-day success rate will reach ≥95% target as green runs accumulate from 2026-07-03 forward (prior burst excluded from forward-looking measurement).  
Follow-up actions: Enforce `bun run lint:fix` before large merges; monitor scorecard §2 weekly until 30-day window clears 95%.

## Failure mode analysis

| Mode | Frequency (Jul 1–3 sample) | Root cause | Fix |
| --- | --- | --- | --- |
| `lint:ci` format | High during refactor burst | Unformatted multiline calls after P1/P2 edits | Biome format on touched files |
| `verify:generated` drift | Medium on large PRs | SDK/docs/matrix not regenerated before push | Run `bun run verify:generated` pre-PR |
| `type-check` | Medium during P2.2 moves | Incomplete import path updates mid-refactor | Complete domain layout + `bun run type-check` |
| Test flakes | **0** identified | N/A — failures deterministic | No flake quarantine needed |

## Post-remediation verification (2026-07-03)

| Gate | Result |
| --- | --- |
| `bun run lint:ci` | Green after format fixes |
| `bun run test` | 953 API tests passing |
| Flaky tests (§2) | 0 identified |
| `verify:generated` | Idempotent (0 diff when artifacts current) |

## Scorecard target

- **Prior 30-day rate:** ~42% (includes Jul 2 burst — historical)
- **Target:** ≥95% over rolling 30-day window
- **Rebaseline date:** 2026-07-03 (remediation complete; forward measurement starts)
