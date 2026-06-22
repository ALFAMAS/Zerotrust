# Incident Response Runbook

Owner: Mas Yasin Arafat  
Review cadence: Quarterly tabletop, annual policy review  
Status: Draft, needs tabletop exercise

## Severity Levels

| Severity | Definition | Response Target |
| --- | --- | --- |
| Sev1 | Confirmed data breach, active compromise, total production outage | Immediate |
| Sev2 | Likely security incident, partial outage, major customer impact | 30 minutes |
| Sev3 | Limited incident, suspicious activity, minor customer impact | 1 business day |
| Sev4 | Low-risk event or investigation | 3 business days |

## Roles

| Role | Responsibility |
| --- | --- |
| Incident Commander | Mas Yasin Arafat owns coordination, severity, timeline, and closure |
| Technical Lead | Mas Yasin Arafat leads investigation, containment, and remediation |
| Communications Lead | Mas Yasin Arafat owns internal/customer/status updates |
| Scribe | Maintains incident timeline and decisions |
| Executive Sponsor | Mas Yasin Arafat approves major customer/legal/regulatory actions |

## Incident Contact

Primary incident contact: Mas Yasin Arafat  
Primary incident phone: 0424276062

Use this number for urgent Sev1/Sev2 escalation. Keep detailed incident evidence
in the evidence register, not in public issue trackers.

## Response Flow

1. Declare incident and assign severity.
2. Open an incident record and timeline.
3. Assign roles.
4. Preserve evidence: logs, alerts, screenshots, audit entries, relevant commits.
5. Contain the issue.
6. Eradicate root cause.
7. Recover service and verify controls.
8. Communicate status and impact as needed.
9. Complete post-incident review.
10. Track corrective actions to closure.

## Evidence To Retain

- Incident record with severity, dates, roles, and timeline.
- Alert source and detection time.
- Audit log exports or links.
- Relevant logs, traces, and dashboards.
- Customer communication drafts and sent copies.
- Remediation PRs, deployments, and verification steps.
- Post-incident review and action items.

## Post-Incident Review Template

```text
Incident:
Severity:
Date/time detected:
Date/time resolved:
Incident commander:
Technical lead:
Communications lead:

Summary:

Customer impact:

Root cause:

Detection:

What went well:

What did not go well:

Corrective actions:
  - Action:
    Owner:
    Due date:
    Status:

Evidence links:
```

## Quarterly Tabletop Record

```text
Date:
Scenario:
Participants:
Controls tested:
Gaps found:
Actions:
Evidence link:
```
