# zerotrust Compliance Documentation

This folder contains the operating documents needed to run zerotrust's compliance
program. The documents are intentionally practical: each one names the owner,
review cadence, required evidence, and where product controls already exist.

## Current Status

These documents are approved for operational use as of **2026-07-03**. Recurring evidence
is tracked in [`evidence-register.md`](./evidence-register.md) and
[`evidence/`](./evidence/README.md).

| Area                | Document                                                                     | Status                                         |
| ------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| Policies            | [policies.md](./policies.md)                                                 | Approved 2026-07-03                            |
| Access lifecycle    | [onboarding-offboarding-checklist.md](./onboarding-offboarding-checklist.md) | Ready to use                                   |
| Vendor management   | [vendor-management-register.md](./vendor-management-register.md)             | Populated; Q3 2026 review complete             |
| Incident response   | [incident-response-runbook.md](./incident-response-runbook.md)               | Q3 2026 tabletop recorded                      |
| Backup/restore      | [backup-restore-runbook.md](./backup-restore-runbook.md)                     | Q3 2026 restore drill recorded                 |
| Access reviews      | [access-review-procedure.md](./access-review-procedure.md)                   | Q3 2026 review recorded                        |
| Monitoring          | [monitoring-evidence-procedure.md](./monitoring-evidence-procedure.md)       | Jul 2026 monitoring packet recorded            |
| SOC 2 planning      | [soc2-auditor-readiness.md](./soc2-auditor-readiness.md)                     | Auditor engaged; observation window 2026-07-04 — 2027-07-03 |
| Evidence tracker    | [evidence-register.md](./evidence-register.md)                               | E-001–E-013 complete; observation window active |

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

| Cadence   | Activity                                                                      |
| --------- | ----------------------------------------------------------------------------- |
| Weekly    | Review open incidents, security alerts, failed backups, and high-risk changes |
| Monthly   | Review vendors, monitoring evidence, backup status, and policy exceptions     |
| Quarterly | Run access review, restore drill, incident tabletop, and vendor risk review   |
| Annually  | Approve policies, run risk assessment, confirm auditor scope                  |

## Links To Product Controls

- Tamper-evident audit log: `src/audit/chain.ts`, migration `0013`, admin verify UI.
- Audit log external anchoring: `src/audit/anchor.ts`, migration `0029`, `audit.anchor` job,
  `bun run audit:anchor-verify`.
- Access reviews: `src/api/routes/access-review.routes.ts`, admin UI under
  `/admin/access-reviews`.
- Legal hold: `src/services/legalHold.service.ts`.
- Data retention: `src/services/dataRetention.ts`.
- Backups: `scripts/ops/db-backup.js`, `scripts/ops/db-restore.js`,
  `src/services/dbBackup.service.ts`.
- Responsible disclosure: `SECURITY.md`, `/.well-known/security.txt`.
