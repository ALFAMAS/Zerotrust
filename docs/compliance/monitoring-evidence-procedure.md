# Monitoring Evidence Procedure

Owner: Mas Yasin Arafat  
Review cadence: Monthly evidence review, quarterly audit sample  
Status: Active — Jul 2026 packet recorded

## Scope

Monitoring evidence should show that security and reliability alerts are active,
reviewed, and acted on.

Relevant systems may include:

- Application logs.
- Prometheus / OpenTelemetry metrics.
- Sentry monitoring.
- Elasticsearch / SIEM audit pipeline.
- Uptime checks.
- Backup job alerts.
- Incident phone escalation to Mas Yasin Arafat at 0424276062.

## Monthly Evidence Collection

Collect and retain:

- Alert policy list or screenshots.
- On-call schedule for the month.
- Alert acknowledgement records.
- Incident tickets created from alerts.
- Backup success/failure records.
- Audit pipeline health checks.

## Alert Review Checklist

| Check | Evidence |
| --- | --- |
| Critical alerts have owners | Alert policy export |
| Alerts route to an active channel | Alertmanager receiver config + `ops:verify-alerting` sign-off |
| On-call rotation is populated | Schedule export |
| Sev1/Sev2 alerts were acknowledged | Alert history |
| Backup failures alert | Backup alert policy |
| Audit pipeline failures alert | SIEM / log pipeline alert policy |

## Monthly Record Template

```text
Month:
Reviewer:
Systems reviewed:
Critical alerts:
Acknowledgement gaps:
Incidents opened:
Backup failures:
Audit pipeline issues:
Follow-up actions:
Evidence link:
```
