# SOC 2 Type II Engagement Letter — Redacted Summary

Evidence ID: E-011  
Control: SOC 2 auditor engagement  
Period: 2026  
Owner: Mas Yasin Arafat  
Date collected: 2026-07-04  
Source system: Signed engagement letter (CPA firm)  
Raw evidence location: Controlled storage — engagement letter PDF (not in Git)

## Summary

Engaged an independent CPA firm specializing in SOC 2 Type II audits. Engagement
covers zerotrust production SaaS environment operated by Mas Yasin Arafat.

## Engagement details (redacted)

| Field | Value |
| --- | --- |
| Auditor | Independent CPA firm (legal name redacted) |
| Engagement type | SOC 2 Type II |
| Trust Services Criteria | Security (CC6–CC8), Availability (A1), Confidentiality (C1 partial), Privacy (P partial) |
| System boundary | Hono API, Next.js UI, worker, PostgreSQL, Redis, S3, Contabo hosting |
| Observation period | 2026-07-04 through 2027-07-03 (12 months) |
| Report target | Q3 2027 |
| Evidence portal | Firm-provided secure portal (URL redacted) |
| Primary contact (auditor) | Redacted — see controlled storage |
| Primary contact (client) | Mas Yasin Arafat |
| Signed date | 2026-07-04 |
| Fee / timeline | Per signed letter in controlled storage |

## Scope exclusions

- Customer-owned infrastructure and IdPs
- Stripe card-processing environment (carve-out; Stripe SOC report)
- Pre-observation-period historical evidence (Type II covers observation window only)

## Result

Pass — engagement letter executed; auditor confirmed and observation window agreed.
See [`observation-window.md`](./observation-window.md) and
[`system-description.md`](./system-description.md).

## Follow-up actions

- Submit monthly evidence summaries per auditor cadence
- Maintain change log during observation period (system description §7)
- Collect vendor SOC reports (Stripe, Neon) into controlled storage by 2026-10-01
