# Production Safety TODO — failsafe CI/CD & hardening

**Created:** 2026-06-28 · **Owner:** platform/maintainers

Forward-looking punch list to make `main` trustworthy and the deploy path
fail-safe. This supersedes the production-readiness notes in
[`PRODUCTION_READINESS_AUDIT.md`](./PRODUCTION_READINESS_AUDIT.md) (a dated
snapshot that predates the 2026-06-28 maintenance slim-down — see
[`MAINTENANCE_FEATURE_AUDIT.md`](./MAINTENANCE_FEATURE_AUDIT.md)).

Severity: 🔴 blocker · 🟠 high · 🟡 medium · 🟢 nice-to-have.

---

## A. Make CI green (`main` is currently red)

CI (`.github/workflows/ci.yml`) gates lint, type-check, tests, generated-doc
drift, SAST, build, and E2E. Several checks are **red on `main` today** — until
they are green, CI cannot be a merge gate. PR #42 was merged with red CI
because branch protection is not enforcing required checks (see §C).

### A1. 🔴 Fix the magic-link token bug (real outage, not a flaky test)

`src/services/magicLink.service.ts:35` calls `crypto.randomBytes(32)` but the
file never imports `crypto` from `node:crypto`. On modern Node the global
`crypto` is WebCrypto, which has **no `randomBytes`** → magic-link generation
throws at runtime. This is the root cause of both the `type-check` error and the
4 failing `magic-link.test.ts` cases. **Magic-link login is broken in prod.**

- [ ] `import { randomBytes } from "node:crypto"` (or `import crypto from "node:crypto"`) and use it.
- [ ] Confirm `magic-link.test.ts` passes; add a regression test that token generation does not throw.

### A2. 🟠 Green the test suite (12 pre-existing failures)

`bun run test` fails 12 / 689. None are caused by the slim-down (verified: the
removal PR left the count unchanged), but they block a green pipeline.

- [ ] `magic-link.test.ts` ×4 → fixed by A1.
- [ ] `apiClient.test.ts` ×7 → mock returns an object without `res.text()`; update the `fetch` mock to a `Response`-shaped stub (`text()`/`json()`), or have `apiClient` tolerate it.
- [ ] `safeFetch.test.ts` ×1 → `rejects public fetches to SSRF-sensitive hosts` assertion vs. guard behaviour; reconcile the expected error/`fetchSpy` call.
- [ ] `dbBackup.cwe78.test.ts` → suite fails to load (`Cannot read 'catch' of undefined`); the `vi.mock("node:fs/promises")` is nested, not top-level — hoist it.

### A3. 🟠 Green the lint job (9 Biome errors)

`bun run lint:ci` reports 9 errors in files unrelated to features:

- [ ] `scripts/smoke-safe-backup-paths.cjs.test.cjs` — `noConsole` ×3 (these are smoke scripts; either add `// biome-ignore lint/suspicious/noConsole` or carve `scripts/**` smoke files out of the lint glob).
- [ ] `scripts/smoke-centralized-modules.mjs:45` — `noSelfCompare` (the determinism assert compares a value to itself; compare two separate computations instead).
- [ ] `src/shared/cryptoHash.ts` — `format` (missing/extra trailing newline); run `bun run lint:fix`.

### A4. 🟡 Green the second type-check error

- [ ] `src/shared/safeBackupPaths.ts:145` — `stdio` tuple typed as `readonly [...]` is not assignable to the mutable `StdioOptions` tuple; widen the local type or drop `as const`.

### A5. 🟢 Keep generated-doc drift gates green

CI runs `git diff --exit-code` on `docs/api-ui-integration-matrix.md`,
`docs/shadcn-adoption-report.md`, and the SDK. The slim-down left
`shadcn-adoption-report.md` stale (now regenerated in this change).

- [ ] Document the rule: any route/UI change must re-run `bun run docs:api`, `bun run ui:audit`, `bun run audit:integration`, and `bun run sdk:generate` before pushing (add to `CONTRIBUTING`/PR template).

---

## B. Fail-safe deploy & data path

### B1. 🔴 Treat the DROP migrations as irreversible

Migrations `0020`–`0024` are `DROP TABLE … CASCADE` / `DROP COLUMN` (collaboration,
workload, federation, growth, SCIM, the `users.did` and `organizations.sso_config`
columns). They cannot be rolled back by reverting code.

- [ ] Take and **verify** a `bun run db:backup` before applying in prod (see [`compliance/backup-restore-runbook.md`](./compliance/backup-restore-runbook.md)).
- [ ] Apply on a staging replica first; confirm the app boots and the smoke suite passes.
- [ ] Adopt expand/contract for future destructive changes (deploy code that stops using a column, ship, *then* drop in a later release) so a bad deploy can roll back without data loss.

### B2. 🟠 Deploy rollback & DR drills

- [ ] Document a one-command app rollback (PM2 `reload`/previous release, or blue-green) alongside the existing [`incident-response-runbook.md`](./compliance/incident-response-runbook.md).
- [ ] Schedule a periodic restore drill from `db:backup` (S3 + local retention) and record evidence.

### B3. 🟠 Secrets & key rotation

- [ ] Verify the dual-key rotation flow for `TOKEN_SECRET_HEX` / `CSFLE_MASTER_KEY_HEX` (README "Security") is runbooked with alerting on rotation windows.
- [ ] Confirm `BACKUP_ENCRYPTION_KEY_HEX` is set in prod and `BACKUP_REQUIRE_ENCRYPTION=true` (fail closed; never write plaintext dumps).

---

## C. Make CI a real gate

- [ ] 🔴 Enable branch protection on `main`: require **Lint & Type Check**, **Tests**, **Build UI**, and **SAST & Dependency Scans** to pass, and require the branch up to date, before merge. (PR #42 merged with red CI because this is not enforced.)
- [ ] 🟡 Decide whether the 85% coverage check (currently non-blocking) should block.
- [ ] 🟡 Keep `bun audit --prod --audit-level=high` and the Semgrep/Trivy SAST jobs blocking; triage findings each release.
- [ ] 🟢 Add a `concurrency` group to cancel superseded runs and reduce queue time.

---

## D. Hardening hygiene (from CLAUDE.md security rules)

- [ ] Keep `safeFetch.test.ts` passing — the SSRF guard is a CWE-918 control; a red test masks regressions.
- [ ] Re-scan diffs against the CWE table in [`CLAUDE.md`](../CLAUDE.md) for any new `fetch`/`spawn`/`fs.writeFile` (the removals shrank this surface — DID resolver, federation, LDAP are gone).
- [ ] Confirm `/healthz`, `/metrics`, and the public `/status` page reference no removed modules after the slim-down.

---

### Quick status snapshot (2026-06-28)

| Check | State | Cause |
|---|---|---|
| Lint & Type Check | 🔴 red | 9 Biome errors + 2 type errors (A1, A3, A4) — all pre-existing |
| Tests | 🔴 red | 12 failures incl. the magic-link bug (A1, A2) |
| Build UI · SAST · E2E | ⚪ unverified | gated behind the red jobs |
| Generated-doc drift | 🟢 green | matrix/SDK/shadcn re-synced |

The slim-down (PR #42) added **no** new failures; everything above pre-dates it.
