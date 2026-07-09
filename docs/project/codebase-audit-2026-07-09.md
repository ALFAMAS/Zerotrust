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
| **CI-3** | **P0** | `main` CI red since 2026-07-08: (a) Dependabot bumped `tailwindcss` 3→4 without migrating the v3-style `postcss.config.js`/`tailwind.config.js`/`globals.css`, breaking `next build`; (b) FE-1 left stale `setToast()` calls in two admin pages, failing typecheck; (c) `scheduler.test.ts` "no REDIS_URI" case read the CI job's real `REDIS_URI` via the default parameter. | **Fixed in this PR** |
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

### CI health (CI-3 — fixed in this PR)

- [x] Pin `tailwindcss` back to `^3.4.0` (v4 was never migrated); Dependabot now ignores
      tailwindcss major bumps until a real v4 migration (`@tailwindcss/postcss`, CSS-first config)
- [x] Replace leftover `setToast()` calls with `useToast().toast()` in
      `packages/ui/src/app/admin/{content,search}/page.tsx`
- [x] `scheduler.test.ts`: clear `process.env.REDIS_URI` in `beforeEach` so the skip-path tests
      are deterministic in CI (the job exports `REDIS_URI` for its Redis service container)
- [x] Homepage accessibility gate (0.93 < 0.95): `--primary` deepened 67%→64% lightness so
      white-on-primary buttons clear 4.5:1 app-wide; flagged `text-primary`/`/70` small text
      lightened; footer `h4`→`h3` (heading order); `<main id="main-content" tabIndex={-1}>` added
      to the landing page (skip-link target). Verified locally: home 1.0, login 0.97, register 0.96
- [x] `Dockerfile` builder stage: copied `bun.lockb*` (repo migrated to text `bun.lock` — no
      lockfile ever reached the image) and ran the root `postinstall` before `scripts/` existed.
      Now copies `bun.lock`, workspace manifests, and `scripts/postinstall.js` before install
- [x] Load & Chaos gate (100% `http_req_failed`): root cause is the **rate limiter**, not k6 —
      the k6 CI profile drives thousands of requests/minute from one IP against the default
      global limit (100/60s per IP) and the hardcoded login limit (20/60s), so virtually every
      request 429s and the gate could never pass (checked back through run history: it has
      **never** been green since PERF-1 made it blocking). Fixed with
      `RATE_LIMITING_ENABLED=false` on the load-test job only (staging validation keeps real
      limits); verified locally — 300 rapid `/status` + 40 rapid logins all 200 with the flag,
      429s without. k6 also pinned to 1.x for reproducibility (the apt repo now serves the new
      2.0.0 major)
- [x] `Dockerfile` runtime stages: `useradd -u 1000` fails (exit 4) because `oven/bun` and
      `node:alpine` base images already ship a UID-1000 user — switched to the images' built-in
      non-root `bun`/`node` users. Latent since the stage was written; never reached while the
      builder stage failed earlier
- [ ] **P1 — open**: 3 Playwright e2e failures, first surfaced now because CI died at build since
      2026-07-08 (FE-1 landed without e2e ever running): access-review "Complete review" button
      never enabled after approve-all (`access-reviews.spec.ts:98`), "email verified" heading
      missing (`auth-flows.spec.ts:62`), invite-accept content missing (`invite.spec.ts:47`).
      Likely FE-1 shadcn-redesign flow regressions — need a local repro with real Postgres
- [ ] **P1**: treat a red `main` as a stop-the-line event — the last **30** completed CI runs on
      `main` (2026-07-06 → 2026-07-09) are all failures, so "Done" rows that assume green gates
      (e.g. PERF-1's blocking k6 gate) were never actually observed passing. Add branch
      protection requiring CI on push-to-main (or a merge queue), since `main` currently takes
      direct pushes
- [ ] **P2**: schedule the actual Tailwind v4 migration, then remove the Dependabot ignore rules
- [ ] **P2**: deliberate k6 v2 migration, then drop the 1.x pin

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
