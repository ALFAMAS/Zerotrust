# Security And Compliance Policies

Owner: Mas Yasin Arafat  
Approver: Mas Yasin Arafat  
Review cadence: Annual, and after material architecture or regulatory changes  
Status: **Approved** — effective 2026-07-03 (next review 2027-07-03)

## 1. Information Security Policy

zerotrust protects customer data through least privilege, secure-by-default
engineering, encryption, monitoring, and documented incident response.

### Requirements

- Production access must be limited to authorized personnel with a business need.
- Authentication must use MFA where supported by the identity provider.
- Secrets must be stored in approved secret stores or environment configuration,
  never in source code.
- Sensitive data must be encrypted in transit and at rest.
- Security-relevant events must be logged to the application audit log or an
  approved monitoring system.
- Security issues must be triaged by severity and tracked to closure.

### Evidence

- Access review records.
- Security incident records.
- CI results for security-relevant changes.
- Audit log integrity verification records.
- Vulnerability reports and remediation tickets.

## 2. Access Control Policy

Access to systems and data is granted using least privilege and reviewed
periodically.

### Requirements

- Access must be approved before provisioning.
- Access must be removed promptly when a user leaves or changes role.
- Privileged access must be reviewed quarterly.
- Shared accounts are not permitted unless a technical constraint requires them;
  such exceptions must be documented.
- Emergency access must be time-bound and reviewed after use.

### Evidence

- Completed onboarding/offboarding checklists.
- Quarterly access review exports from `/admin/access-reviews`.
- Exception records with approval and expiry.

## 3. Change Management Policy

Production changes must be reviewed, tested, and traceable.

### Requirements

- Code changes must be reviewed through pull requests.
- CI must pass before merge unless an approved emergency process is used.
- Database migrations must be checked into `drizzle/` and applied through the
  standard migration process.
- Emergency changes must be documented after the fact with rationale, approver,
  and verification.

### Evidence

- Pull requests and review records.
- CI run links.
- Migration files and migration logs.
- Emergency change records.

## 4. Incident Response Policy

Security and reliability incidents must be identified, contained, resolved, and
reviewed.

### Requirements

- Incidents must have a named incident commander.
- Severity must be assigned early and updated as facts change.
- Customer-impacting incidents must include a communication owner.
- A post-incident review must be completed for Sev1/Sev2 incidents.
- A tabletop exercise must be run at least quarterly.

### Evidence

- Incident records.
- Post-incident reviews.
- Tabletop exercise records.
- Customer communications, when applicable.

## 5. Vendor Management Policy

Vendors that process customer data or support production systems must be reviewed
before use and periodically thereafter.

### Requirements

- Vendors must be classified by data access and operational criticality.
- High-risk vendors must have security documentation reviewed before approval.
- Vendor owners must confirm ongoing need at least quarterly.
- Sub-processors must be tracked.

### Evidence

- Vendor register.
- Security review notes.
- DPA / sub-processor records.
- Quarterly vendor review records.

## 6. Business Continuity And Disaster Recovery Policy

zerotrust must be able to restore critical service after operational failure,
data loss, or regional provider incident.

### Requirements

- Database backups must be configured and monitored.
- Restore drills must be performed quarterly.
- Recovery objectives must be reviewed annually.
- Restore procedures must be documented and tested.

### Recovery Targets

| System              | RPO                | RTO     |
| ------------------- | ------------------ | ------- |
| Production database | 24 hours or better | 4 hours |
| Application API/UI  | 1 hour             | 2 hours |
| Audit evidence      | 24 hours           | 8 hours |

### Evidence

- Backup job logs.
- Restore drill records.
- Recovery objective review records.
- Incident records for recovery events.
