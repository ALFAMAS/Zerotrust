# Compliance Evidence Register

Owner: Mas Yasin Arafat  
Review cadence: Monthly  
Status: Active — Q3 2026 evidence cycle complete; SOC 2 observation window active (2026-07-04)

Use this register to track evidence collected for SOC 2 and internal compliance.
Store the evidence itself outside the repository unless it is intentionally
public and non-sensitive.

## Evidence Register

| ID | Control Area | Evidence | Period | Owner | Location | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E-001 | Policies | Approved policy set | 2026 | Mas Yasin Arafat | [2026 approval](./evidence/2026/policies/2026-07-03-approval.md) | Complete | Effective 2026-07-03 |
| E-002 | Access Control | Quarterly access review | 2026-Q3 | Mas Yasin Arafat | [Q3 access review](./evidence/2026/Q3/access-reviews/2026-Q3-access-review.md) | Complete | `/admin/access-reviews` |
| E-003 | Access Lifecycle | Onboarding/offboarding samples | 2026-Q3 | Mas Yasin Arafat | [Q3 lifecycle sample](./evidence/2026/Q3/access-lifecycle/2026-Q3-onboarding-offboarding-sample.md) | Complete | Three events sampled |
| E-004 | Vendor Management | Vendor register and reviews | 2026-Q3 | Mas Yasin Arafat | [Q3 vendor review](./evidence/2026/Q3/vendor-reviews/2026-Q3-vendor-review.md) | Complete | Five vendors reviewed |
| E-005 | Incident Response | Tabletop exercise | 2026-Q3 | Mas Yasin Arafat | [Q3 tabletop](./evidence/2026/Q3/incidents/2026-07-03-tabletop-exercise.md) | Complete | Credential-stuffing scenario |
| E-006 | Backup/Restore | Restore drill record | 2026-Q3 | Mas Yasin Arafat | [Q3 restore drill](./evidence/2026/Q3/backup-restore-drills/2026-07-03-restore-drill.md) | Complete | Runbook verified |
| E-007 | Monitoring | Alert and incident-call records | 2026-07 | Mas Yasin Arafat | [Jul monitoring packet](./evidence/2026/07/monitoring/2026-07-monitoring-packet.md) | Complete | Sentry + escalation path |
| E-008 | Change Management | PR/CI sample | 2026-Q3 | Mas Yasin Arafat | [Q3 PR samples](./evidence/2026/Q3/change-management/2026-Q3-pr-samples.md) | Complete | Representative merged PRs |
| E-009 | Audit Log | Integrity + external anchoring | 2026-Q3 | Mas Yasin Arafat | [Anchor implementation](./evidence/2026/Q3/audit-log/2026-07-03-anchor-implementation.md) | Complete | `bun run audit:anchor-verify` |
| E-010 | Risk Assessment | Risk register and treatment plan | 2026 | Mas Yasin Arafat | [2026 annual export](./evidence/2026/risk-assessment/2026-annual-risk-assessment.md) | Complete | `/admin/compliance` risk register |
| E-011 | SOC 2 Engagement | Engagement letter (redacted summary) | 2026 | Mas Yasin Arafat | [Engagement letter](./evidence/auditor-engagement/engagement-letter-summary.md) | Complete | Signed 2026-07-04; raw PDF in controlled storage |
| E-012 | SOC 2 Engagement | Observation window confirmation | 2026-07-04 — 2027-07-03 | Mas Yasin Arafat | [Observation window](./evidence/auditor-engagement/observation-window.md) | Complete | 12-month Type II window |
| E-013 | SOC 2 Engagement | System description v1.0 | 2026 | Mas Yasin Arafat | [System description](./evidence/auditor-engagement/system-description.md) | Complete | Auditor sign-off 2026-07-04 |

## Evidence Quality Rules

- Evidence must show who performed the activity.
- Evidence must show when it occurred.
- Evidence must cover the correct period.
- Evidence must be retained in a stable location.
- Evidence containing customer data must not be committed to Git.

## Exception Register

| Exception | Control | Owner | Approved By | Opened | Expires | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — | None open |
