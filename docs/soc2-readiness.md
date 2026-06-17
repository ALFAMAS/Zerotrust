# SOC 2 Type II Readiness

A mapping of ZeroAuth's existing controls to the SOC 2 Trust Services Criteria
(TSC), plus the gaps to close before an audit. This is a readiness checklist, not
an attestation — a Type II report requires an independent auditor observing
controls operating over a 3–12 month window.

## Control mapping (implemented)

### CC6 — Logical & physical access controls
- Authentication: password (bcrypt) + **MFA/TOTP enforced at login**, WebAuthn
  passkeys, magic links, OAuth/OIDC, SAML.
- **Account lockout** (per-account) + **credential-stuffing defense** (per-IP).
- **RBAC/ABAC** authorization (`authz.service.ts`), org roles, scoped API keys
  (live/test), short-lived agent/workload tokens.
- **Per-org IP allowlist** and global geofencing.
- Session management: PASETO v4 tokens, refresh rotation, device limits,
  continuous evaluation, anomaly detection.

### CC7 — System operations / monitoring
- **Audit log** of security events, tagged human-vs-agent, streamed to
  Elasticsearch and fanned out to a **SIEM**.
- Error-spike / latency **alerting** (Slack / Teams / PagerDuty).
- Distributed tracing (Jaeger), Prometheus/OTel metrics, public **/status** page.

### CC8 — Change management
- Versioned, reviewed schema migrations (Drizzle); **API versioning** with
  deprecation/sunset policy.
- CI test suite (vitest) gates changes; conventional commits + semantic-release.

### A1 — Availability
- Daily **pg_dump backups** with retention + optional S3; documented
  **restore + PITR** runbook ([`backup-restore.md`](./backup-restore.md)).

### C1 / P (Confidentiality & Privacy)
- **CSFLE** field encryption with key versioning; HIBP breach checks.
- **GDPR** self-serve data export + account deletion; **data retention** auto-purge
  with **legal hold** exemption; **email suppression** + deliverability hardening.

## Gaps to close before audit

- [ ] **Formal policies** — Information Security, Access Control, Incident
      Response, Change Management, Vendor Management, BCP/DR (written + approved).
- [ ] **Access reviews** — periodic (quarterly) review of admin/role grants with
      evidence retained.
- [ ] **Onboarding/offboarding** — documented joiner/leaver checklist with
      timely access revocation evidence.
- [ ] **Risk assessment** — annual documented risk assessment + treatment plan.
- [ ] **Vendor management** — sub-processor inventory + security review records.
- [ ] **Incident response** — runbook + post-incident reviews; tabletop exercise.
- [ ] **Tamper-evident audit log** — hash-chain / external anchoring (see §2.5).
- [ ] **Backup restore drill** — evidence of periodic successful restores.
- [ ] **Monitoring evidence** — alert acknowledgement + on-call records.
- [ ] **Auditor + window** — engage a CPA firm; select the observation period.

## Suggested next steps

1. Adopt a compliance automation platform (Vanta / Drata / Secureframe) to
   collect evidence continuously.
2. Write and get sign-off on the policies listed above.
3. Run the quarterly access review + backup restore drill; retain evidence.
4. Begin the Type II observation window once controls are operating.
