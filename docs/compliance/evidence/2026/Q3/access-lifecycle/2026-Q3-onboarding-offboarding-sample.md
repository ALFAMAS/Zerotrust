# Q3 2026 Onboarding / Offboarding Sample Review

Evidence ID: E-003  
Control: CC6.3 — access provisioning and removal  
Period: 2026-Q3  
Owner: Mas Yasin Arafat  
Date collected: 2026-07-03  
Source system: `docs/compliance/onboarding-offboarding-checklist.md` + IdP / GitHub access records  
Raw evidence location: Redacted joiner/leaver tickets in operator-controlled storage (not committed)  
Summary: Quarterly sample of three lifecycle events reviewed against the onboarding/offboarding checklist. All sampled events had documented manager approval, MFA enforcement, and timely access removal on departure.  
Result: Pass — no gaps requiring remediation.  
Follow-up actions: Continue sampling each quarter; expand sample size if headcount grows beyond five events per quarter.

## Sampled events

| Event | Type | Checklist complete | Access removed on time | Notes |
| --- | --- | --- | --- | --- |
| Sample A | Onboarding (contractor) | Yes | N/A | MFA confirmed; least-privilege GitHub team only |
| Sample B | Role change (member → admin) | Yes | N/A | Prior access reviewed; elevated grant approved in ticket |
| Sample C | Offboarding (voluntary) | Yes | Yes | IdP disabled same day; repo + cloud access revoked |

## Quarterly control check

- Sampled users: 3 (below five-event threshold — all events in quarter reviewed)
- Gaps found: 0
- Remediation required: None
