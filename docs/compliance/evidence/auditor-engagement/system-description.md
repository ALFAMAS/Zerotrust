# System Description — zerotrust (SOC 2 Type II)

Evidence ID: E-013  
Owner: Mas Yasin Arafat  
Version: 1.0  
Effective: 2026-07-04  
Last updated: 2026-07-04

> Signed PDF stored in controlled storage (outside Git). This file is the
> redacted, repo-local summary approved for the observation window beginning
> 2026-07-04.

## 1. Company overview

- Legal entity name: Mas Yasin Arafat (sole proprietor / operator)
- Product name: zerotrust
- Primary business purpose: Identity, access management, and security platform
  for organizations (authentication, MFA, org RBAC/ABAC, billing, audit logging)
- Deployment model: SaaS (self-hosted option documented; production operated as SaaS)

## 2. System boundary

### In scope

- Hono API (`src/api/server.ts`, port 1337) — 27 route modules, 30 mounts
- Next.js UI (`packages/ui/`, port 3000) — 53 App Router pages
- Background worker (`src/worker.ts`, BullMQ schedulers + queues)
- PostgreSQL via Neon (Drizzle ORM, 41 tables, 29 migrations)
- Redis (sessions, rate limiting, email queue, job queues)
- Contabo VPS (application runtime, nginx TLS termination)
- S3-compatible object storage (uploads, encrypted backups, audit-log anchors)
- Optional: Elasticsearch (search/audit fan-out; disabled by default)

### Out of scope

- Customer-owned IdPs beyond configured OAuth providers (Google, GitHub, Facebook)
- Stripe payment card processing beyond the integration boundary (Stripe is a
  subservice organization)
- End-user devices, browsers, and customer networks
- Third-party OAuth provider infrastructure

## 3. Trust Services Criteria in scope

| TSC | Included | Notes |
| --- | --- | --- |
| Security (CC6–CC8) | Yes | Auth, RBAC/ABAC, audit log + external anchoring, encryption, change management |
| Availability (A1) | Yes | Health checks, automated backups, quarterly restore drills |
| Confidentiality (C1) | Partial | CSFLE field encryption, access controls, least privilege |
| Privacy (P) | Partial | GDPR export/delete, consent receipts, ROPA, SAR workflow |

## 4. Subservice organizations

| Vendor | Function | Data processed | Carve-out / inclusive |
| --- | --- | --- | --- |
| Neon | PostgreSQL hosting / PITR | Production database | Inclusive — monitored via vendor review |
| Contabo | Application hosting | Runtime, server logs | Inclusive |
| Stripe | Billing and payments | Customer billing data | Carve-out — Stripe SOC report relied upon |
| MXroute | Transactional email | Email addresses, message metadata | Inclusive |
| Sentry | Error monitoring | Error data, stack traces | Inclusive |

Full register: [`vendor-management-register.md`](../../vendor-management-register.md).

## 5. Infrastructure and data flows

Reference: [`docs/reference-architecture.md`](../../../reference-architecture.md),
[`docs/ARCHITECTURE.md`](../../../ARCHITECTURE.md).

**Authentication flow:** Users authenticate via email/password, magic link, OAuth,
passkeys (WebAuthn), or TOTP. API issues PASETO v4 access tokens (1-hour TTL) and
rotating refresh tokens (SHA-256 hashed at rest). Sessions stored in PostgreSQL with
Redis-backed rate limiting.

**Data stores:**

- PostgreSQL — primary persistence (users, orgs, sessions, audit log, billing)
- Redis — ephemeral (sessions cache, rate limits, job queues)
- S3-compatible — objects (avatars, backups, audit anchors)

**Logging and monitoring:**

- Structured application logs
- Prometheus `/metrics` endpoint
- Optional OpenTelemetry / Sentry (configured per environment)
- Tamper-evident audit log (`src/audit/chain.ts`) with optional external anchoring
  (`src/audit/anchor.ts`, migration `0029`)

**Network:** nginx TLS termination → API (:1337) and UI (:3000). All external
traffic encrypted in transit (TLS 1.2+).

## 6. Control environment summary

Approved policies effective 2026-07-03: [`policies.md`](../../policies.md).

Q3 2026 evidence cycle complete (E-001–E-010): access reviews, restore drill,
tabletop exercise, vendor review, monitoring packet, change-management samples,
risk assessment, audit-log anchoring. Register:
[`evidence-register.md`](../../evidence-register.md).

Product controls: RBAC/ABAC, continuous verification, account lockout,
credential-stuffing defense, input sanitization middleware, CSFLE field encryption,
legal hold, data retention jobs, responsible disclosure (`SECURITY.md`).

## 7. Changes during observation period

Maintain a running log of material control or architecture changes with PR links
and deployment dates. Initial baseline: observation window start 2026-07-04.

| Date | Change | PR / reference |
| --- | --- | --- |
| 2026-07-04 | Auditor engagement + observation window begins | E-011, E-012 |

## 8. Sign-off

| Role | Name | Date |
| --- | --- | --- |
| System owner | Mas Yasin Arafat | 2026-07-04 |
| Engineering lead | Mas Yasin Arafat | 2026-07-04 |
| Auditor acknowledgment | Independent CPA firm (redacted) | 2026-07-04 |
