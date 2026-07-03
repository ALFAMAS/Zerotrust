# ADR 009 — Physical per-region data residency (CP-1)

**Status:** Accepted (blueprint — not implemented in the default template)  
**Date:** 2026-07-04  
**Context:** [`todo.md`](../todo.md) CP-1 (full); [`region.service.ts`](../src/services/ops/region.service.ts)

## Problem

`organizations.storageRegion` is a **logical label** (`us` | `eu` | `apac`) used for
compliance reporting, routing hints, and risk-register honesty (R-006 partial). The
default single-region deployment stores **all** org data in one Postgres instance and
one S3-compatible bucket. Contractual data-residency commitments require **physical**
isolation: separate databases and object stores per region, with request routing based
on the org's `storageRegion`.

## Decision

Adopt a **region-sharded** topology for forks that need CP-1 (full). The open-source
template remains single-region; sharding is an operator/fork concern documented here.

### Target topology

| Region | Postgres | Object store | Notes |
|--------|----------|--------------|-------|
| `us` | `DATABASE_URL_US` | `S3_BUCKET_US` / `UPLOADS_CDN_URL_US` | Default template region |
| `eu` | `DATABASE_URL_EU` | `S3_BUCKET_EU` | EU/EEA contractual residency |
| `apac` | `DATABASE_URL_APAC` | `S3_BUCKET_APAC` | APAC contractual residency |

### Routing rules

1. **Resolve org** — from session, API key `orgId`, or `X-Org-Id` header.
2. **Load `storageRegion`** — `organizations.storageRegion` (validated via `isValidRegion()`).
3. **Select pool** — `getDbForRegion(storageRegion)` returns the regional Drizzle instance;
   unknown/missing region fails closed in `residency.strictMode`.
4. **Object uploads** — `getS3ConfigForRegion(storageRegion)` selects bucket + CDN base URL.
5. **Cross-region admin** — platform admin console uses `app.rls_bypass` + explicit region
   parameter; never replicate PII across regions for convenience queries.

### Implementation checklist (fork)

- [ ] Add `REGION_SHARDING_ENABLED=true` and per-region `DATABASE_URL_*` / `S3_*` env vars.
- [ ] Implement `src/db/regionPools.ts` — map `StorageRegion` → `{ db, readDb, s3 }`.
- [ ] Extend `authMiddleware` / `apiKeyAuth` to attach `storageRegion` on context after org resolve.
- [ ] Replace bare `getDb()` in org-scoped routes with `getDbForOrg(orgId)` (or ALS-backed context).
- [ ] Worker/cron jobs iterate regions or consume `region` from job payload.
- [ ] Migration strategy: one-time export/import per org with `storageRegion` tag; no live split in template.
- [ ] Update SOC 2 system description and R-006 evidence when physical controls are live.

## Consequences

- **Default template:** unchanged — single Postgres + single S3; R-006 stays `partial`.
- **Forks with residency SLAs:** follow this ADR; do not claim full residency until all checklist items ship.
- **CP-1 (full)** remains in [`todo.md`](../todo.md) until a reference implementation lands in code (optional) or a fork documents production evidence.

## References

- [`docs/deployment.md`](./deployment.md) — production topology
- [`docs/reference-architecture.md`](./reference-architecture.md) — K8s/VM blueprints
- [`docs/compliance/evidence/2026/risk-assessment/2026-annual-risk-assessment.md`](../docs/compliance/evidence/2026/risk-assessment/2026-annual-risk-assessment.md) — R-006
