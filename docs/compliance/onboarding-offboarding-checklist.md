# Onboarding And Offboarding Checklist

Owner: Mas Yasin Arafat  
Review cadence: Quarterly sample review  
Status: Draft, ready to use

Use this checklist for employees, contractors, and service accounts with access
to ZeroAuth systems.

## Onboarding

Record one completed checklist per new joiner.

| Step | Owner | Evidence |
| --- | --- | --- |
| Confirm role, manager, start date, and required access | Hiring manager | Approved request |
| Approve system access before provisioning | System owner | Approval comment or ticket |
| Create identity provider account | IT / Admin | IdP user record |
| Enforce MFA | IT / Admin | IdP MFA status |
| Add to least-privilege groups | System owner | Group membership export |
| Grant production access only if required | Engineering lead | Approval record |
| Provide security onboarding material | People / Security | Completion record |
| Confirm acceptable use and confidentiality obligations | People | Signed agreement |
| Add to on-call or incident channels if applicable | Engineering lead | Channel membership |

## Role Change

Run this when a user's role or team changes.

| Step | Owner | Evidence |
| --- | --- | --- |
| Review current access against new role | Manager | Access review note |
| Remove access no longer needed | System owner | Group diff / ticket |
| Add newly approved access | System owner | Approval record |
| Confirm privileged access remains justified | Engineering lead | Approval record |

## Offboarding

Access removal should be completed by the end of the user's last working day, or
immediately for involuntary termination.

| Step | Owner | Evidence |
| --- | --- | --- |
| Disable identity provider account | IT / Admin | IdP disabled-user record |
| Revoke production access | Engineering lead | Group / role export |
| Revoke repository access | Engineering lead | GitHub access record |
| Revoke cloud, database, and observability access | System owner | Access export |
| Rotate shared secrets if exposure risk exists | Engineering lead | Change record |
| Transfer ownership of services, docs, and tickets | Manager | Handoff note |
| Preserve records subject to legal hold | Legal / Security | Legal hold note |
| Close offboarding ticket | Manager | Completed ticket |

## Quarterly Control Check

Sample at least five onboarding/offboarding events per quarter, or all events if
fewer than five occurred.

Record:

- Sampled users.
- Whether each checklist was complete.
- Any access removed during the review.
- Remediation owner and due date for any gap.
