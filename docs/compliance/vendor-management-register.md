# Vendor Management Register

Owner: Mas Yasin Arafat  
Review cadence: Quarterly  
Status: Active — last reviewed 2026-07-03

Track vendors that process customer data, support production systems, or affect
security/compliance operations.

## Risk Ratings

| Rating | Criteria |
| --- | --- |
| High | Processes customer data, production secrets, payment data, or critical infrastructure |
| Medium | Supports operations but has limited data or system access |
| Low | No customer data and no production access |

## Vendor Register

| Vendor | Owner | Purpose | Data Access | Criticality | Risk | Review Date | Evidence Link | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Neon | Mas Yasin Arafat | PostgreSQL hosting / PITR | Production database | High | High | 2026-07-03 | [Q3 2026 review](./evidence/2026/Q3/vendor-reviews/2026-Q3-vendor-review.md) | Active |
| Contabo | Mas Yasin Arafat | Application hosting / VPS infrastructure | Production runtime, server logs | High | High | 2026-07-03 | [Q3 2026 review](./evidence/2026/Q3/vendor-reviews/2026-Q3-vendor-review.md) | Active |
| MXroute | Mas Yasin Arafat | Transactional and operational email hosting | Email addresses, message metadata, outbound email content | Medium | Medium | 2026-07-03 | [Q3 2026 review](./evidence/2026/Q3/vendor-reviews/2026-Q3-vendor-review.md) | Active |
| Sentry | Mas Yasin Arafat | Error monitoring and issue triage | Error data, stack traces, possible identifiers | Medium | Medium | 2026-07-03 | [Q3 2026 review](./evidence/2026/Q3/vendor-reviews/2026-Q3-vendor-review.md) | Active |
| Stripe | Mas Yasin Arafat | Billing and payments | Customer billing data | High | High | 2026-07-03 | [Q3 2026 review](./evidence/2026/Q3/vendor-reviews/2026-Q3-vendor-review.md) | Active |

## Review Checklist

For each High or Medium vendor, retain:

- Business owner and purpose.
- Data processed and data location, if known.
- SOC 2 / ISO 27001 / security whitepaper or equivalent.
- DPA or data-processing terms where personal data is processed.
- Sub-processor list or link.
- Breach notification terms.
- Exit plan or replacement strategy for High criticality vendors.

## Quarterly Review Record

| Quarter | Reviewer | Vendors Reviewed | Changes | Open Risks | Evidence Link |
| --- | --- | --- | --- | --- | --- |
| 2026-Q3 | Mas Yasin Arafat | Neon, Contabo, MXroute, Sentry, Stripe | Initial population + review | Collect SOC reports into controlled storage | [Q3 2026 review](./evidence/2026/Q3/vendor-reviews/2026-Q3-vendor-review.md) |
