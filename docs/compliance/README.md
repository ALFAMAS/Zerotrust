# ZeroAuth Compliance Documentation

This folder contains the operating documents needed to run ZeroAuth's compliance
program. The documents are intentionally practical: each one names the owner,
review cadence, required evidence, and where product controls already exist.

## Current Status

These documents are implementation-ready drafts owned by Mas Yasin Arafat. They
still need approval dates and recurring evidence before they can be used as audit
evidence.

| Area | Document | Status |
| --- | --- | --- |
| Policies | [policies.md](./policies.md) | Drafted, pending approval |
| Access lifecycle | [onboarding-offboarding-checklist.md](./onboarding-offboarding-checklist.md) | Drafted, ready to use |
| Vendor management | [vendor-management-register.md](./vendor-management-register.md) | Template drafted, needs vendor entries |
| Incident response | [incident-response-runbook.md](./incident-response-runbook.md) | Drafted, needs tabletop exercise |
| Backup/restore | [backup-restore-runbook.md](./backup-restore-runbook.md) | Drafted, needs restore drill evidence |
| Access reviews | [access-review-procedure.md](./access-review-procedure.md) | Drafted, maps to shipped access-review tooling |
| Monitoring | [monitoring-evidence-procedure.md](./monitoring-evidence-procedure.md) | Drafted, needs alert/on-call records |
| SOC 2 planning | [soc2-auditor-readiness.md](./soc2-auditor-readiness.md) | Drafted, needs auditor + window |
| Audit log hardening | [audit-log-anchoring-plan.md](./audit-log-anchoring-plan.md) | Design drafted, not implemented |
| Evidence tracker | [evidence-register.md](./evidence-register.md) | Template drafted |

## Evidence Storage Convention

Use this repository for the compliance program, the evidence register, and
sanitized evidence summaries. Put those records under
[`evidence/`](./evidence/README.md).

Raw evidence often contains sensitive data: screenshots with emails, access
exports, vendor contracts, incident details, phone numbers, customer records,
tokens, IP addresses, or logs. Do not commit those raw files unless they are
explicitly reviewed and safe to keep in Git. Instead, record a summary in the
repo and link or reference the controlled source copy.

Suggested repo-local structure:

```text
docs/compliance/evidence/
  YYYY/
    Q1/
      access-reviews/
      backup-restore-drills/
      incidents/
      monitoring/
      vendor-reviews/
      change-management/
```

Safe to commit:

- Completed checklist summaries.
- Redacted quarterly review records.
- Links or references to source evidence.
- Dates, owners, results, and remediation actions.

Do not commit:

- Secrets, tokens, private keys, `.env` values.
- Customer data or production log extracts.
- Vendor contracts or invoices.
- Full access exports with personal data.
- Incident evidence that exposes vulnerabilities or customer impact.

## Operating Cadence

| Cadence | Activity |
| --- | --- |
| Weekly | Review open incidents, security alerts, failed backups, and high-risk changes |
| Monthly | Review vendors, monitoring evidence, backup status, and policy exceptions |
| Quarterly | Run access review, restore drill, incident tabletop, and vendor risk review |
| Annually | Approve policies, run risk assessment, confirm auditor scope |

## Links To Product Controls

- Tamper-evident audit log: `src/audit/chain.ts`, migration `0013`, admin verify UI.
- Access reviews: `src/api/routes/access-review.routes.ts`, admin UI under
  `/admin/access-reviews`.
- Legal hold: `src/services/legalHold.service.ts`.
- Data retention: `src/services/dataRetention.ts`.
- Backups: `scripts/db-backup.js`, `scripts/db-restore.js`,
  `src/services/dbBackup.service.ts`.
- Responsible disclosure: `SECURITY.md`, `/.well-known/security.txt`.
