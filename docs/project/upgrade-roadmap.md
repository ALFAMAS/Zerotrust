# Upgrade roadmap — SaaS starter template

**Audience:** Maintainers deciding what to invest in next; teams forking this template who want to
know where it's headed.

**What this is:** A prioritized catalog of upgrades beyond the production baseline
([`../production-checklist.md`](../production-checklist.md)). Items here are *improvements*, not
gaps — the baseline is shippable today. Ordered by leverage within each tier. Open hygiene items
live in [`todo.md`](./todo.md); this doc is the forward-looking menu.

**Legend:** 🟢 small (≤1 day) · 🟡 medium (2–5 days) · 🔴 large (1–3 weeks)

---

## Tier 1 — process guardrails (do these first; they protect everything else)

| # | Upgrade | Size | Why |
| - | ------- | ---- | --- |
| 1 | **Branch protection + merge queue on `main`** | ✅ shipped | Operator runbook + `bun run branch-protection:check` in `docs/deployment.md` § Branch protection; apply via GitHub UI or `gh api` (repo admin). |
| 2 | **Schema↔migrations drift guard in CI** (MIG-4) | ✅ shipped | Run `drizzle-kit generate` in CI and fail on a non-empty diff — prevents the "column shipped in code without a migration" class that `0041` had to repair. |
| 3 | **Dependabot majors policy** | ✅ shipped | `dependabot-label.yml` + `dependabot-auto-merge.yml`; no per-package semver-major ignores — majors get `needs-migration`, minor/patch get `automerge`. |
| 4 | **Per-PR preview environments** | ✅ shipped | `pr-preview.yml` + `docker-compose.preview.yml` — CI compose smoke per PR with sticky comment; optional `PREVIEW_SSH_*` cloud path documented. |

## Tier 2 — deliberate toolchain migrations (currently pinned)

| # | Upgrade | Size | Notes |
| - | ------- | ---- | ----- |
| 5 | **Tailwind v4** | ✅ shipped | `@tailwindcss/postcss`, CSS-first `@theme inline` in `globals.css`, `tw-animate-css`; Dependabot tailwindcss ignore removed. |
| 6 | **TypeScript 7 (native compiler)** | 🟡 | Blocked: Next.js 16.2.10 refuses `next build` with TS7 ("Failed to install required TypeScript dependencies"). API `tsc --noEmit` may pass; adopt repo-wide when Next accepts it. |
| 7 | **k6 v2** | ✅ shipped | Load scripts validated against v2 (no `externally-controlled` / deprecated APIs); apt pin removed in `ci.yml`. |

## Tier 3 — architecture (fork-friendly structure)

| # | Upgrade | Size | Notes |
| - | ------- | ---- | ----- |
| 8 | **`packages/shared-types`** | ✅ shipped | `@zerotrust/shared-types` — pilot Zod schemas (pagination, register, org invite, API error envelope); wired in API + UI; see [`docs/shared-types.md`](../shared-types.md). |
| 9 | **`apps/api` + `apps/web` workspace rename** | 🔴 deferred | Symmetric workspaces; large blast radius — **blocked** until a concrete driver (e.g. second app). Tracked in [`todo.md`](./todo.md). |
| 10 | **`deploy/k8s/` Helm chart** | ✅ shipped | `deploy/k8s/helm/zerotrust/` + kustomize overlays (`base/`, `staging/`, `production/`); see [`deploy/k8s/README.md`](../../deploy/k8s/README.md). |
| 11 | **Terraform/OpenTofu module** | ✅ shipped | `deploy/terraform/` — VPC, RDS Postgres + replicas, ElastiCache Redis, S3, Route 53 DNS scaffold; see [`deploy/terraform/README.md`](../../deploy/terraform/README.md). |
| 12 | **Read-replica routing** | ✅ shipped | `readDb()` / `writeDb()` in `src/db/repositories/dbConnections.ts`; org/session/webhook repos route SELECTs to replica; tests in `repositories.readReplica.test.ts`. |

## Tier 4 — product/SaaS surface (differentiators for a starter template)

| # | Upgrade | Size | Notes |
| - | ------- | ---- | ----- |
| 13 | **Usage-based billing (Stripe meters)** | ✅ shipped | `stripeMeter.service.ts` + `POST /billing/usage-events`; API-key middleware fans out meter events when `STRIPE_METER_ENABLED=true`. |
| 14 | **Feature flags** | ✅ shipped | `org_feature_flags` table + `isFeatureEnabled()` + org settings UI panel. |
| 15 | **Customer webhooks portal** | ✅ shipped | Dashboard CRUD + deliveries + replay + rotate-secret (`POST /webhooks/:id/replay/:deliveryId`, `POST /webhooks/:id/rotate-secret`). |
| 16 | **SCIM 2.0 provisioning** | ✅ shipped | `/scim/v2/Users` + `/scim/v2/Groups` with org bearer tokens (`org_scim_tokens`). |
| 17 | **Audit log SIEM export** | ✅ shipped | `GET /admin/audit/export/ndjson` (HMAC-signed) + `POST …/upload` S3 drop via `BACKUP_S3_*`. |
| 18 | **Public status page** | ✅ shipped | `/status` page + `GET /status/history` 90-day daily snapshots (Redis or in-memory). |
| 19 | **In-app onboarding checklist** | ✅ shipped | Org → invite → MFA → API key flow; `onboarding` hints on `GET /auth/me`. |
| 20 | **Admin analytics dashboard** | ✅ shipped | `GET /admin/analytics` + `/admin/analytics` UI (cohorts, auth mix, anomaly trends). |

## Tier 5 — security hardening beyond baseline

| # | Upgrade | Size | Notes |
| - | ------- | ---- | ----- |
| 21 | **Wire or delete the acknowledged orphans** | 🟢 | `apiKeyRotation.service.ts`, `deviceAttestation.ts`, `continuousEval.ts` sit knip-ignored — each is either a feature a fork would want or dead weight. Decide per file. |
| 22 | **Secrets manager integration** | 🟡 | Optional Vault/AWS-SM/Doppler loader in `src/config` so production secrets never live in `.env` files on disk. |
| 23 | **Hardware key store fork path → shipped provider** | 🔴 | CRYPTO-1 left TPM/PKCS#11 as a documented fork path; ship at least the PKCS#11 provider for cloud HSMs. |
| 24 | **RLS everywhere + org-scoped repo factory** | 🔴 | Policies cover high-value tables; extend to every org-scoped table and make the repository factory inject the org context by construction. |

---

_Compiled 2026-07-11 from the codebase audits (2026-07-09/11), shipped.md, and the knip/orphan
inventory. Re-rank quarterly with the maintenance scorecard._
