## CI-3 follow-ups (2026-07-10)

This document captures the operational follow-ups identified in the 2026-07-09 audit
(`docs/project/todo.md` → CI-3). Some items are **repository changes**; others are
**GitHub settings** that cannot be enforced from code.

### Prevent a red `main` from accumulating

These are **GitHub settings** (org/repo admin required):

- Enable **branch protection** (or **merge queue**) on `main`.
- Require **status checks**:
  - `Lint & Type Check`
  - `Tests`
  - `Docker image smoke test`
  - `E2E UI (Playwright)` (if enabled on the repo)
  - `Load test (k6)` (if enabled on the repo)
- Require branches to be **up to date** before merge.
- Require at least **1 approving review** (2 for auth/crypto changes recommended).

Rationale: if `main` is red, subsequent merges compound the debugging surface and
increase MTTR.

### Tailwind v4 migration plan (then remove Dependabot ignore)

Tailwind v4 is intentionally ignored for semver-major bumps in `.github/dependabot.yml`
because a bare bump breaks builds against the v3 PostCSS/Tailwind config surface.

Migration steps (recommended order):

- Update UI build pipeline to v4’s PostCSS integration (`@tailwindcss/postcss`) and
  ensure `postcss.config.js` is correct for Next.js.
- Update `tailwind.config.*` and `globals.css` to the v4-compatible shape.
- Run `bun run --cwd packages/ui build` and fix style regressions.
- Re-run the full CI verification (`bun run build`, `bun run test`, `bun run verify:generated`,
  and Playwright E2E).
- Once green, remove the `tailwindcss` semver-major ignore entries from
  `.github/dependabot.yml`.

### k6 v2 migration plan (then drop the apt pin)

CI currently installs k6 1.x (apt repo) with a 1.x pin in `.github/workflows/ci.yml`.

Migration steps:

- Update local runner docs + CI to install k6 v2 (preferred: official install script or
  direct download of the pinned release asset).
- Run the load suites locally and in CI:
  - `bun run load:login`
  - `bun run load:auth-cache`
  - `k6 run tests/load/full-suite.k6.js` (CI profile)
  - `k6 run tests/load/chaos-fault.k6.js` (CI profile)
- Fix any breaking API changes in the k6 v2 runtime.
- Remove the k6 1.x apt pin block from `.github/workflows/ci.yml`.

