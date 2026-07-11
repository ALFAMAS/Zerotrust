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
| 1 | **Branch protection + merge queue on `main`** | 🟢 | Three CI-breaking direct pushes landed in one week (unmigrated Tailwind v4, unmigrated TS7, stale lockfile). Require the CI check before merge; direct pushes to `main` off. |
| 2 | **Schema↔migrations drift guard in CI** (MIG-4) | ✅ shipped | Run `drizzle-kit generate` in CI and fail on a non-empty diff — prevents the "column shipped in code without a migration" class that `0041` had to repair. |
| 3 | **Dependabot majors policy** | 🟢 | Keep grouped minor/patch bumps auto-mergeable; route majors to a `needs-migration` label instead of ignores per-package (today: tailwindcss + typescript ignored ad-hoc). |
| 4 | **Per-PR preview environments** | 🟡 | Compose stack per PR (Fly.io/Railway/Coolify or a k8s namespace) so UI changes are reviewable without local setup. |

## Tier 2 — deliberate toolchain migrations (currently pinned)

| # | Upgrade | Size | Notes |
| - | ------- | ---- | ----- |
| 5 | **Tailwind v4** | 🟡 | `@tailwindcss/postcss`, CSS-first config, migrate `globals.css` tokens; then drop both Dependabot ignores. |
| 6 | **TypeScript 7 (native compiler)** | 🟡 | Blocked on Next.js support. API side already compiles under TS7; adopt repo-wide when Next accepts it. ~10× faster type-checks. |
| 7 | **k6 v2** | 🟢 | Validate `tests/load/*.k6.js` against v2 semantics, unpin the apt install in `ci.yml`. |

## Tier 3 — architecture (fork-friendly structure)

| # | Upgrade | Size | Notes |
| - | ------- | ---- | ----- |
| 8 | **`packages/shared-types`** | 🟡 | Single source of Zod schemas consumed by API validation *and* UI forms/SDK — removes the drift the API↔UI integration matrix currently polices after the fact. |
| 9 | **`apps/api` + `apps/web` workspace rename** | 🔴 | Symmetric workspaces; large blast radius (Dockerfiles, compose, workflows, docs) — only with a concrete driver such as a second app. |
| 10 | **`deploy/k8s/` Helm chart** | 🟡 | Blueprint 3 in `reference-architecture.md` exists on paper; ship the chart + kustomize overlays. |
| 11 | **Terraform/OpenTofu module** | 🟡 | VPC + managed PG/Redis + object storage + DNS in one `terraform apply`, matching the VPS hardening runbook. |
| 12 | **Read-replica routing** | 🟡 | `DATABASE_URL_READ_REPLICA` is plumbed; add a repository-level read/write split for hot list endpoints. |

## Tier 4 — product/SaaS surface (differentiators for a starter template)

| # | Upgrade | Size | Notes |
| - | ------- | ---- | ----- |
| 13 | **Usage-based billing (Stripe meters)** | 🔴 | Wallet + points ledger exist; add metered events → Stripe usage records → invoice line items. The API-key `rate_limit_per_minute`/`monthly_quota` columns are already in the schema. |
| 14 | **Feature flags** | 🟡 | Org-scoped flags table + `assertCan()`-style helper + admin toggle UI; unlocks progressive delivery for forks. |
| 15 | **Customer webhooks portal** | 🟡 | Delivery/retry infra exists (`src/webhooks/`); add the dashboard surface: endpoint CRUD, delivery log, replay button, signing-secret rotation. |
| 16 | **SCIM 2.0 provisioning** | 🔴 | `org_scim_tokens` table exists; implement /scim/v2 Users+Groups against it — the enterprise checkbox. |
| 17 | **Audit log SIEM export** | 🟢 | Hash-chained audit log already streams to Elasticsearch; add a signed NDJSON export endpoint + S3 drop for Splunk/Datadog ingestion. |
| 18 | **Public status page** | 🟢 | `GET /status` has components; render a public Next.js page + uptime history off it. |
| 19 | **In-app onboarding checklist** | 🟡 | First-run task list (create org → invite → enable MFA → create API key) — big template-adoption win. |
| 20 | **Admin analytics dashboard** | 🟡 | MRR/ARR panels exist; add cohort retention, auth-method mix, and anomaly trends from data already collected. |

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
