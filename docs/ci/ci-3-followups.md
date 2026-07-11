## CI-3 follow-ups (2026-07-10)

This document captures the operational follow-ups identified in the 2026-07-09 audit
(`docs/project/todo.md` → CI-3). Some items are **repository changes**; others are
**GitHub settings** that cannot be enforced from code.

### Prevent a red `main` from accumulating

These are **GitHub settings** (org/repo admin required). **Runbook shipped 2026-07-12:**
see [`docs/deployment.md`](../deployment.md) § Branch protection on `main` and
`bun run branch-protection:check`.

- Enable **branch protection** (or **merge queue**) on `main`.
- Require **status checks**:
  - `Lint & Type Check`
  - `Tests`
  - `Docker image smoke test`
  - `SAST & Dependency Scans`
  - `Build UI`
  - `Lighthouse CI gate`
  - `Playwright E2E & Accessibility Smoke`
  - `Load & Chaos Tests`
- Require branches to be **up to date** before merge.
- Require at least **1 approving review** (2 for auth/crypto changes recommended).

Rationale: if `main` is red, subsequent merges compound the debugging surface and
increase MTTR.

### Tailwind v4 — shipped 2026-07-12

See [`shipped.md`](../project/shipped.md) § Toolchain migrations (Tailwind v4).

### k6 v2 — shipped 2026-07-12

See [`shipped.md`](../project/shipped.md) § Toolchain migrations (k6 v2).

### TypeScript 7 — still blocked (2026-07-12)

Next.js **16.2.10** refuses `next build` with `typescript@7` ("Failed to install
required TypeScript dependencies"). Stay on TS6 until Next documents TS7 support.
Dependabot semver-major PRs for `typescript` now receive the `needs-migration` label
(via `dependabot-label.yml`) instead of a silent ignore in `dependabot.yml`.
