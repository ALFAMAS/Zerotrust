# Codebase audit — 2026-07-09

**Audience:** Maintainers and agents deciding what to fix before/while running zerotrust in production.

**What this is:** A fresh production-grade audit of the repository as of 2026-07-09. It is a
**delta** on top of [`../production-checklist.md`](../production-checklist.md) (2026-07-07 audit):
rows that doc marks **Done** were spot-verified and are not repeated here unless the claim no
longer holds. Findings carry IDs (`MIG-*`, `DEP-*`, `STR-*`, `HYG-*`, `TEST-*`, `DOC-*`) and are
mirrored into [`todo.md`](./todo.md).

**Legend:** **P0** = ship blocker · **P1** = fix before scale · **P2** = improvement

---

## Executive summary

The repo is in strong shape overall — CI gates (lint, typecheck, SAST, boundaries, destructive-migration
check, k6, Lighthouse), canonical shared modules, compliance docs, and deploy workflows are real and
wired. This audit found **one P0 regression** and a set of structural/hygiene items:

| ID | Priority | Finding | Status |
| -- | -------- | ------- | ------ |
| **MIG-1** | **P0** | 11 migration files (`0030`–`0040`) missing from `drizzle/meta/_journal.json` — `bun run db:migrate` (used by staging/production deploy workflows) will never apply them. Includes the org **RLS policies** the security checklist relies on. | **Open** |
| **HYG-1** | P1 | Stray artifacts committed to git: `tmp-verify/`, `packages/ui/src/graphify-out/`, `packages/ui/src/app/graphify-out/` (tool caches inside the Next.js App Router tree). | **Fixed in this PR** |
| **DEP-1** | P1 | Root `package.json` ships UI/dead deps (`tailwindcss-animate`, `xpath`) and misplaces `@types/web-push` in `dependencies`; knip `ignoreDependencies` suppresses the warnings instead of fixing them. | Open |
| **STR-1** | P2 | `scripts/` sprawl: ~29 files mixing ops, codegen, CI checks, smoke tests, codemods, and Windows `.ps1` repair tools in one flat dir. | Open (carried from 2026-07-07) |
| **STR-2** | P2 | Cross-cutting API subsystems (`src/jit`, `src/ssf`, `src/webhooks`, `src/notifications`, `src/mfa`) sit as top-level roots beside layer dirs. | Open (carried from 2026-07-07) |
| **STR-3** | P2 | Oversized route modules: `auth.routes.ts` (~1,200 lines), `admin.routes.ts` (~1,130 lines). | Open |
| **STR-4** | P2 | Legacy duplicated model surfaces: `src/db/schema.ts` beside `src/db/schema/`, and orphaned `src/models/` (knip-ignored). | Open |
| **TEST-1** | P2 | Tests live in four places (`src/__tests__/` 149 files, `packages/ui/src/**/*.test.tsx`, `packages/ui/e2e/`, `tests/load/`) with no index doc. | Open |
| **DOC-2** | P2 | Filename casing drift (`docs/Agentqualityrules.MD`); migration count in docs ("41 files") no longer matches disk (43). | Partially fixed (count) |

---

## MIG-1 — migration journal drift (P0)

**Evidence.** `drizzle/` contains 43 `.sql` files; `drizzle/meta/_journal.json` registers only 32.
Missing from the journal:

```
0030_webhook_endpoints_org_id   0035_org_rls_policies      0038_org_rls_expansion
0031_audit_logs_immutable       0036_usage_counters_rls    0039_refresh_token_family_id
0032_drop_tenants               0037_drop_storage_region   0040_session_active_org_id
0033_jit_org_ids                0034_drop_webhook_tenant_id
```

There are also **duplicate number prefixes** (`0034_*` ×2, `0035_*` ×2) — evidence that files were
added by hand or on diverged branches without regenerating the journal.

**Why it matters.**

- `.github/workflows/deploy-staging.yml` and `deploy-production.yml` run `bun run db:migrate`
  (drizzle-kit, journal-driven). A fresh staging/production database will silently **skip all 11
  migrations** — including `0035_org_rls_policies.sql` and `0038_org_rls_expansion.sql`, which back
  the "Tenant isolation + Postgres RLS — Done" row in `production-checklist.md`, plus
  `0031_audit_logs_immutable` (tamper-evident audit) and `0039_refresh_token_family_id`
  (refresh-token rotation).
- CI never catches this because every CI job uses `bun run db:push` (schema sync from code), which
  bypasses the journal entirely. Green CI ≠ working `db:migrate`.

**Fix (do not ship to prod before this).**

1. Decide the canonical order for the colliding prefixes and **renumber** one of each pair
   (e.g. `0034_drop_webhook_tenant_id` → `0041_…`, `0035_org_rls_policies` → `0042_…`), or keep
   names and rely on journal order — but do it deliberately.
2. Add journal entries (`idx`, `when`, `tag`, `breakpoints`) for all 11 files in the chosen order.
   Snapshots are also missing for most of them (`drizzle/meta/` has gaps); regenerate with
   `bunx drizzle-kit generate` against the current schema if needed.
3. For **existing** databases that were synced via `db:push`, the new journal entries will try to
   re-apply DDL that already exists. `0040` already guards with `IF NOT EXISTS`; audit the other 10
   for idempotency or backfill `__drizzle_migrations` rows on those databases before running migrate.
4. **Add a CI guard** so this can't regress: a script that fails when `ls drizzle/*.sql` and
   journal tags diverge (and when a number prefix is duplicated). Wire it next to
   `migrations:check` in `ci.yml`.
5. Add one CI job that boots a fresh Postgres and runs `bun run db:migrate` (not `db:push`) + the
   smoke test, so the production migration path is actually exercised.

---

## Production-readiness checklist (2026-07-09 delta)

Work top to bottom. Everything already **Done** in
[`production-checklist.md`](../production-checklist.md) still stood up to spot checks
(CI workflows, deploy pipelines, backups, observability, compliance docs) **except** the rows
touched by MIG-1.

### Data / migrations

- [ ] **P0 — MIG-1**: journal repaired, duplicate prefixes resolved, drift guard in CI (see above)
- [ ] **P0**: CI job exercising `db:migrate` against a fresh Postgres (today only `db:push` runs)
- [ ] **P1**: verify staging/production DBs actually have RLS policies applied
      (`SELECT * FROM pg_policies WHERE schemaname='public';`) — if they were provisioned via
      `db:push` they have them; if via `db:migrate` they do **not**
- [x] Destructive-migration gate (`migrations:check`) — still wired in CI

### Dependencies (DEP-1)

- [ ] **P1**: remove `xpath` from root `package.json` (no imports anywhere in `src/`, `plugins/`,
      `scripts/`, or `packages/`)
- [ ] **P1**: remove `tailwindcss-animate` from **root** deps (already correctly declared in
      `packages/ui/package.json`)
- [ ] **P2**: move `@types/web-push` from `dependencies` to `devDependencies`
- [ ] **P2**: after the above, delete the matching entries from `knip.config.ts`
      `ignoreDependencies` — the suppression list is how these went unnoticed; treat additions to it
      as review-blocking
- [ ] **P2**: burn down the "known orphans" in `knip.config.ts` `ignore` (e.g. `src/models/user.model.ts`,
      `src/api/schemas/{admin,mfa,session}.schema.ts`, unused chart components) — wire or delete

### Repo hygiene (HYG-1 — fixed in this PR)

- [x] `tmp-verify/` deleted from git (stray compiled verify artifact)
- [x] `packages/ui/src/graphify-out/` + `packages/ui/src/app/graphify-out/` deleted (tool caches;
      the second sat **inside the App Router tree**)
- [x] `.gitignore` now covers `tmp-verify/` and `**/graphify-out/`
- [ ] **P2**: decide whether `.codex/`, `.agents/`, `.claude/homunculus/` belong in the public repo
      or in a contributor-local setup (noise for fork consumers; `.gitignore` lists `.claude/` and
      `.vscode/` yet both are tracked — pick one policy)

### Testing (TEST-1)

- [ ] **P2**: add `docs/testing.md` (or a README section) mapping the four test surfaces:
      `src/__tests__/` (API vitest), `packages/ui/src/**/*.test.tsx` (happy-dom),
      `packages/ui/e2e/` (Playwright), `tests/load/` (k6) — and which CI job runs each
- [ ] **P1** (carried, DQ-2): keep ratcheting coverage floors — target 70% API / 60% UI

### Docs (DOC-2)

- [x] Migration count corrected in `production-checklist.md` (was "41 files")
- [ ] **P2**: rename `docs/Agentqualityrules.MD` → `docs/agent-quality-rules.md` (case-collision
      risk on case-insensitive filesystems; only lowercase-`.md` file breaking the convention)

---

## File-structure change plan

Ordered so each phase is independently shippable. **Do not** reshuffle `src/shared/`, root
`plugins/`, `src/db/repositories/`, or `packages/ui/src/lib/server-state/` — those layouts are
load-bearing and referenced by `CLAUDE.md`/`AGENTS.md` and `.boundaries.json`.

### Phase 0 — hygiene (this PR, zero risk)

Delete committed junk, tighten `.gitignore`. Done — see HYG-1 above.

### Phase 1 — `scripts/` regroup (STR-1, ~1 day)

Flat `scripts/` (29 files) becomes:

```
scripts/
├── ops/        db-backup.js, db-restore.js, ops-smoke.mjs, verify-alerting.mjs,
│               bootstrap-admin.ts, setup-postgres-roles.sql, audit-anchor*.ts
├── codegen/    generate-sdk.ts, generate-api-docs.mjs, expand-openapi-gaps.mjs,
│               token-codemod.mjs, split-schema-domains.ts, sync-org-columns.ts
├── ci/         check-boundaries.ts, check-org-scoping.ts, check-destructive-migrations.ts,
│               audit-api-ui-map.mjs, org-scoped-tables.json
├── smoke/      smoke-*.{mjs,cjs}, smoke-ui-stubs/
└── windows/    fix-junctions.ps1, repair-junctions.ps1
```

Mechanical, but touches many references — update in the same commit: root `package.json` scripts,
`.github/workflows/*.yml`, `knip.config.ts` entry globs, `docs/deployment.md` command snippets,
`postinstall.js` path (stays at `scripts/postinstall.js`; npm lifecycle references it directly).

### Phase 2 — consolidate mounted subsystems (STR-2, ~2–3 days)

`src/jit/`, `src/ssf/`, `src/webhooks/` (and optionally `src/notifications/`, `src/mfa/`) →
`src/modules/{jit,ssf,webhooks,…}/`. One mental model: *layer dirs* (`api`, `middleware`, `services`,
`db`, `shared`) vs *feature modules* (`modules/*`) vs *pluggable features* (root `plugins/*`).
Update `.boundaries.json` domains and `tsconfig` paths in the same PR; keep old paths as re-export
shims for one release if external forks import them.

### Phase 3 — split oversized route files (STR-3, incremental)

- `src/api/routes/auth.routes.ts` (~1,200 lines) → `auth/` folder: `login.routes.ts`,
  `register.routes.ts`, `token.routes.ts`, `avatar.routes.ts`, mounted by an `auth/index.ts`
  that preserves the current URL surface.
- `src/api/routes/admin.routes.ts` (~1,130 lines) → same treatment.
- Rule of thumb going forward: route module > ~500 lines ⇒ split by resource.

### Phase 4 — retire duplicate model surfaces (STR-4, opportunistic)

- Fold anything still imported from `src/db/schema.ts` into `src/db/schema/*` and delete the legacy
  file (or reduce it to `export * from "./schema"` and mark deprecated).
- Delete `src/models/` once `settings.model.ts`/`user.model.ts` consumers move to the Drizzle
  schema types (`user.model.ts` is already a knip-acknowledged orphan).

### Phase 5 — workspace rename (fork-dependent, only with a driver)

`src/` → `apps/api/`, `packages/ui/` → `apps/web/`, plus `packages/shared-types/` for API↔UI Zod
schemas, `deploy/k8s/` per `docs/reference-architecture.md` Blueprint 3. Large blast radius
(Dockerfiles, compose, all workflows, every doc); do it only when a concrete need appears
(second app, published SDK consumers), not for aesthetics.

### Target tree (after phases 0–4)

```
zerotrust/
├── plugins/                   # feature plugins (unchanged)
├── src/
│   ├── api/routes/            # thin modules, auth/ + admin/ split
│   ├── modules/               # jit, ssf, webhooks, notifications, mfa
│   ├── services/  middleware/  shared/  db/{schema,repositories}/  …
├── packages/{client,ui}/
├── drizzle/                   # journal == files, guarded in CI
├── scripts/{ops,codegen,ci,smoke,windows}/
├── tests/load/
└── docs/ …
```

---

## Verification

```bash
# MIG-1 drift check (should output nothing once fixed)
comm -13 <(grep -o '"tag": "[^"]*"' drizzle/meta/_journal.json | cut -d'"' -f4 | sort) \
         <(ls drizzle/*.sql | sed 's|drizzle/||;s|\.sql||' | sort)

# DEP-1
grep -rn "xpath" src plugins scripts packages --include="*.ts" --include="*.js"   # no hits
bun run knip                                                                       # after unsuppressing

# HYG-1
git ls-files | grep -E "tmp-verify|graphify-out"                                   # no hits

# Standard gates
bun run lint:ci && bun run type-check && bun run test && bun run verify:generated
```

---

_Audit date: 2026-07-09. Method: manual verification of structure, deps, migrations journal,
CI/deploy workflows, and prior checklist claims. Prior audit: `docs/production-checklist.md`
(2026-07-07)._
