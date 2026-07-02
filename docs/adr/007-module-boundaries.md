# ADR 007: Module Boundary Strategy

**Status:** Accepted
**Date:** 2026-07-01
**Deciders:** Project maintainers

## Context

The `src/` directory has grown to ~150 TypeScript files covering auth, billing,
organizations, compliance, and operational concerns. Services and routes import
across domains freely — there is no enforced dependency direction. This creates
invisible coupling: a billing route can import OAuth internals, a compliance
route can depend on wallet services, and nothing flags it.

Without boundaries, the codebase trends toward a big ball of mud — every module
is a potential dependency of every other, refactors ripple across unrelated
features, and the modularity of the route/service split is illusory.

## Decision

Partition `src/` into **six domain layers** plus a **shared foundation**, with
enforced dependency direction:

```
shared  ◄──  integrations  ◄──  identity  ◄──  tenancy  ◄──  billing
 (x)              (o)              (o)           (o)          (o)
                  ◄──────────────────── compliance ──────────────────► (reads all)
                  ◄──────────────────── ops ─────────────────────────► (reads all)
```

### Domains

| Domain | Paths | Owns |
|---|---|---|
| **shared** | `src/shared/` | Canonical modules — pagination, safe fetch/redirect, crypto hash, HTTP errors, roles, sanitization, API helpers |
| **integrations** | `src/oauth/`, `src/notifications/`, `src/mfa/channels/`, `src/templates/` | Third-party connectors — OAuth providers (Google/GitHub/Apple/Facebook), email service, MFA OTP channels, web push, notification dispatch |
| **identity** | `src/api/routes/auth.*`, `src/api/routes/session.*`, `src/api/routes/passkey.*`, `src/api/routes/mfa.*`, `src/api/routes/magic-link.*`, `src/api/routes/verification.*`, `src/services/token.*`, `src/services/email*`, `src/services/magicLink.*`, `src/services/passwordBreach.*`, `src/services/session*`, `src/crypto/`, `src/middleware/auth.ts` | Authentication, session lifecycle, tokens, password management, MFA, passkeys |
| **tenancy** | `src/api/routes/org.*`, `src/api/routes/tenant.*`, `src/jit/` | Organizations, teams, roles, invites, cross-tenant JIT |
| **billing** | `src/api/routes/billing.*`, `src/api/routes/wallet.*`, `src/services/wallet.*`, `src/services/stripe*`, `src/db/repositories/stripe*` | Stripe billing, subscriptions, webhooks, wallet ledger |
| **compliance** | `src/api/routes/compliance.*`, `src/api/routes/access-review.*`, `src/api/routes/gdpr.*`, `src/services/privacy.*`, `src/services/dataRetention.*` | SOC 2, access reviews, privacy, GDPR, data retention, audit log |
| **ops** | `src/api/routes/admin*`, `src/api/routes/search.*`, `src/api/routes/feedback.*`, `src/api/routes/support.*`, `src/api/routes/unsubscribe.*`, `src/services/slo.*`, `src/services/siem.*`, `src/services/objectStorage.*`, `src/services/dbBackup.*`, `src/webhooks/`, `src/ssf/`, `src/metrics/`, `src/telemetry/` | Admin panels, search, SIEM, backups, webhooks, SSF, metrics, SLO, object storage |

### Rules

1. **Shared** (`src/shared/`, `src/config/`, `src/logger/`, `src/db/schema.ts`,
   `src/models/`, `src/middleware/` minus auth middleware) — **no domain imports
   allowed**. Shared code must not reach into any domain directory.

2. **Integrations** — may only import from `shared` and `integrations`
   directories. Must not import identity, tenancy, billing, compliance, or ops
   code.

3. **Identity** — may import from `shared`, `integrations`, and `identity`
   (peers within identity). Must not import tenancy, billing, compliance, or ops
   code.

4. **Tenancy** — may import from `shared`, `integrations`, `identity`, and
   `tenancy` peers. Must not import billing, compliance, or ops code.

5. **Billing** — may import from `shared`, `integrations`, `identity`, `tenancy`,
   and `billing` peers. Must not import compliance or ops code.

6. **Compliance and Ops** — may import from every domain (they are read-only
   cross-cutting consumers). Must not be imported by identity, tenancy, or
   billing.

7. **Enforcement** — a CI script (`scripts/check-boundaries.ts`) scans imports
   and fails on violations. The script reads `.boundaries.json` for the domain
   definitions so changes to the map are explicit and reviewable.

## Alternatives considered

| Option | Why rejected |
|---|---|
| **No boundaries** | The AUDIT (M3) documented silent coupling growth. Without boundaries, the codebase trends toward a big ball of mud. |
| **Full hexagonal/clean architecture** | Over-engineering for a monolith template — ports/adapters add indirection without proportional benefit at this scale. |
| **NPM workspaces per domain** | Forces install-time separation but complicates the monolith's shared module reuse and doesn't catch runtime coupling. |
| **`dependency-cruiser` / `madge`** | Good tools but add a Node dependency; a custom script is ~100 lines, dependency-free, and precise about the repo's specific rules. |

## Consequences

- **Positive:** Dependency direction is visible and enforced. Before a PR
  merges, CI will flag an identity→billing import that would previously have
  been silent.
- **Positive:** The boundary file (`.boundaries.json`) is the single source of
  truth for domain mapping. Adding a new domain or moving a module requires
  updating one file.
- **Negative:** Existing violations may exist in the codebase. The CI script
  runs as a warning initially; once violations are resolved, it becomes
  blocking.
- **Negative:** The boundary definitions must be kept current as files move or
  new services are added. The `scripts/check-boundaries.ts` script is the
  enforcement mechanism and guardrail.

## References

- Boundary definitions: `.boundaries.json`
- Enforcement script: `scripts/check-boundaries.ts`
- AUDIT finding M3: `docs/AUDIT.md` — resolved (P2.2)
