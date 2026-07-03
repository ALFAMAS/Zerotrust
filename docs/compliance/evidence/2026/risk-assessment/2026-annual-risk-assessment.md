# 2026 Annual Risk Assessment Export

Evidence ID: E-010  
Control: CC3.2 — risk assessment  
Period: 2026  
Owner: Mas Yasin Arafat  
Date collected: 2026-07-03  
Source system: `/admin/compliance` risk register (`risk_assessments` table, `GET /compliance/risk-assessment/2026`)  
Raw evidence location: In-app register + this sanitized export  
Summary: Annual product risk register reviewed and confirmed current. Nine risks seeded and maintained in `src/services/compliance/compliance.service.ts`; all entries have likelihood × impact scores, treatment plans, owners, and mitigated status as of Q3 2026.  
Result: Pass — no open high-severity risks without treatment; average risk score within acceptable band.  
Follow-up actions: Re-assess annually or after major auth/billing/infra changes; add new risks via admin compliance UI as threats emerge.

## Register summary (2026)

| Metric | Value |
| --- | --- |
| Total risks | 9 |
| Open | 0 |
| Mitigated | 9 |
| Closed | 0 |
| Average risk score | 9 (likelihood × impact, scale 1–5) |

## Top risks (sanitized)

| ID | Category | Title | Score | Treatment | Status |
| --- | --- | --- | ---: | --- | --- |
| R-001 | security | Credential stuffing attack | 12 | Rate limiting, lockout, HIBP, anomaly detection | mitigated |
| R-002 | security | Token theft | 10 | Short TTL, hashed refresh tokens, secure headers | mitigated |
| R-003 | availability | Database outage | 10 | Read replicas, pooling, PITR, backups | mitigated |
| R-005 | compliance | GDPR data breach | 10 | CSFLE, residency controls, access reviews, audit log | mitigated |
| R-008 | security | Insider threat | 8 | Admin checks, audit log, impersonation TTL, access reviews | mitigated |

Full register available in-product at `/admin/compliance` → Risk Register tab.
