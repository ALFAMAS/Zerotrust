# Phase 4 — Final Integration, CI/CD, and Staging Sign-off

Date: 2026-06-25  
Goal: provide a repeatable staging sign-off gate for performance, DAST, Lighthouse, operations smoke, and load testing.

## Implemented in this phase

| Workstream | Deliverable | Exit criterion |
|---|---|---|
| Staging validation workflow | `.github/workflows/staging-validation.yml` with manual `staging_url` and `api_url` inputs. | Human leads can run a single workflow against staging before release sign-off. |
| Lighthouse gate | `.lighthouserc.json` requires performance >=90, accessibility >=95, best practices >=90. | Public staging pages meet the starter-template quality bar. |
| DAST | OWASP ZAP baseline runs against the staging UI URL. | No blocking baseline findings before sign-off. |
| Ops smoke | Reuses `bun run ops:smoke` against the staging API URL. | `/health`, `/metrics`, and `/api/versions` pass. |
| Load validation | Runs strict k6 full-suite against the staging API URL and uploads JSON results. | p95/p99 thresholds and error-rate budgets pass or produce release-blocking evidence. |

## Human sign-off steps

1. Deploy the candidate branch to staging.
2. Open **Actions → Staging Validation → Run workflow**.
3. Enter the public staging UI URL and API URL.
4. Attach Lighthouse, ZAP, k6, and ops-smoke artifacts to the release PR.
5. Do not approve production promotion until all required jobs pass or an explicit human exception is recorded.
