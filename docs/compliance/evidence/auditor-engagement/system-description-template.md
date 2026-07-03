# System Description — Draft Template (SOC 2 Type II)

Owner: Mas Yasin Arafat  
Version: 0.1 (template)  
Last updated: 2026-07-03

> Complete this document before the observation window begins. The signed PDF
> belongs in secure storage; commit only a redacted summary or pointer here.

## 1. Company overview

- Legal entity name:
- Product name: zerotrust
- Primary business purpose:
- Deployment model: SaaS / self-hosted (circle one)

## 2. System boundary

### In scope

- Hono API (`src/api/server.ts`, port 1337)
- Next.js UI (`packages/ui/`, port 3000)
- Background worker (`src/worker.ts`, BullMQ schedulers + queues)
- PostgreSQL (Drizzle ORM, migrations under `src/db/migrations/`)
- Redis (sessions, rate limiting, job queues)
- S3-compatible object storage (uploads, backups, audit anchors)
- Optional: Elasticsearch (search/audit fan-out, disabled by default)

### Out of scope

- Customer-owned IdPs beyond configured OAuth providers
- Third-party payment processing beyond Stripe integration boundary
- End-user devices and browsers

## 3. Trust Services Criteria in scope

| TSC | Included | Notes |
| --- | --- | --- |
| Security (CC6–CC8) | Yes | Auth, RBAC/ABAC, audit log, encryption |
| Availability (A1) | Yes | Health checks, backups, restore drills |
| Confidentiality (C1) | Partial | CSFLE field encryption, access controls |
| Privacy (P) | Partial | GDPR export/delete, consent, ROPA |

## 4. Subservice organizations

Document vendors from [`vendor-register.md`](../vendor-register.md): Stripe, email
SMTP provider, cloud host, S3 provider, optional observability (Sentry, etc.).

## 5. Infrastructure and data flows

Reference [`docs/reference-architecture.md`](../../../reference-architecture.md) and
[`docs/ARCHITECTURE.md`](../../../ARCHITECTURE.md).

- Authentication: PASETO v4 + refresh rotation, MFA, passkeys
- Data stores: Postgres (primary), Redis (ephemeral), S3 (objects/backups)
- Logging/monitoring: structured logs, Prometheus `/metrics`, optional OTel/Sentry

## 6. Control environment summary

Point to approved policies under `docs/compliance/policies/` and Q3 2026 evidence
(E-001–E-010) in `docs/compliance/evidence/2026/`.

## 7. Changes during observation period

Maintain a running changelog of material control or architecture changes with PR
links and deployment dates.

## 8. Sign-off

| Role | Name | Date |
| --- | --- | --- |
| System owner | Mas Yasin Arafat | |
| Engineering lead | | |
| Auditor acknowledgment | | |
