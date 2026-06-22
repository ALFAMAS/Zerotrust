# Compliance Evidence Register

Owner: Mas Yasin Arafat  
Review cadence: Monthly  
Status: Template drafted

Use this register to track evidence collected for SOC 2 and internal compliance.
Store the evidence itself outside the repository unless it is intentionally
public and non-sensitive.

## Evidence Register

| ID | Control Area | Evidence | Period | Owner | Location | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E-001 | Policies | Approved policy set | Annual | Mas Yasin Arafat | `docs/compliance/evidence/YYYY/policies/` | Not started | Needs approval |
| E-002 | Access Control | Quarterly access review | YYYY-QN | Mas Yasin Arafat | `docs/compliance/evidence/YYYY/QN/access-reviews/` | Not started | Use `/admin/access-reviews` |
| E-003 | Access Lifecycle | Onboarding/offboarding samples | YYYY-QN | Mas Yasin Arafat | `docs/compliance/evidence/YYYY/QN/access-lifecycle/` | Not started | Sample joiners/leavers |
| E-004 | Vendor Management | Vendor register and reviews | YYYY-QN | Mas Yasin Arafat | `docs/compliance/evidence/YYYY/QN/vendor-reviews/` | Not started | MXroute, Contabo, Sentry, Neon, Stripe |
| E-005 | Incident Response | Tabletop exercise | YYYY-QN | Mas Yasin Arafat | `docs/compliance/evidence/YYYY/QN/incidents/` | Not started | Use runbook template |
| E-006 | Backup/Restore | Restore drill record | YYYY-QN | Mas Yasin Arafat | `docs/compliance/evidence/YYYY/QN/backup-restore-drills/` | Not started | Use restore runbook |
| E-007 | Monitoring | Alert and incident-call records | YYYY-MM | Mas Yasin Arafat | `docs/compliance/evidence/YYYY/MM/monitoring/` | Not started | Sentry + phone escalation |
| E-008 | Change Management | PR/CI sample | YYYY-QN | Mas Yasin Arafat | `docs/compliance/evidence/YYYY/QN/change-management/` | Not started | Pull request samples |
| E-009 | Audit Log | Integrity verification | YYYY-QN | Mas Yasin Arafat | `docs/compliance/evidence/YYYY/QN/audit-log/` | Not started | Admin verify output |
| E-010 | Risk Assessment | Risk register and treatment plan | Annual | Mas Yasin Arafat | `docs/compliance/evidence/YYYY/risk-assessment/` | Not started | Needs separate register |

## Evidence Quality Rules

- Evidence must show who performed the activity.
- Evidence must show when it occurred.
- Evidence must cover the correct period.
- Evidence must be retained in a stable location.
- Evidence containing customer data must not be committed to Git.

## Exception Register

| Exception | Control | Owner | Approved By | Opened | Expires | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD | TBD | TBD | Open |
