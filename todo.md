# zerotrust — TODO

Consolidated, prioritized backlog of work that is **not yet shipped**. Shipped
features live in [`tdone.md`](./tdone.md); the standing audit is
[`docs/AUDIT.md`](./docs/AUDIT.md). The focused fork-readiness audit is
[`AUDIT-REPORT.md`](./AUDIT-REPORT.md).

**Priorities:** P0 critical/security · P1 stability/correctness · P2
maintainability/refactor · P3 scalability/performance · P4 docs/DX · P5 compliance.
**Status:** Pending · In Progress.

---

_P3 scalability & performance (P3.1–P3.5) shipped 2026-07-03 — see
[`tdone.md`](./tdone.md) §P3 scalability & performance._

---

## Audit backlog — 2026-07-03

_Synthesized from `docs/AUDIT.md`, `AUDIT-REPORT.md`, `docs/maintenance-scorecard.md`,
`docs/api-ui-integration-matrix.md`, `docs/tanstack-query-progress.md`,
`docs/compliance/`, and a full-repo scan. Does not duplicate shipped work in
[`tdone.md`](./tdone.md)._

_Verified 2026-07-03: **21 open items** (P1.3 removed — duplicate of shipped P3.2
in `tdone.md`; admin/org/support/session list GETs already use `getReadDb()`)._

### P1 — Stability and correctness

- **P1.4 — Extend repository layer beyond the current seven repos** _(partial — 7 repos shipped; hot paths still inline)_
  - **Where:** `src/db/repositories/` (7 today); inline Drizzle remains in
    `passkey.routes.ts`, `mfa.routes.ts`, `support.routes.ts`, parts of
    `admin.routes.ts`.
  - **Why:** AUDIT C1/M1 — multi-statement mutations without a single transaction
    boundary are correctness risk under retry/concurrency.
  - **Acceptance:** At least support-ticket create/reply/close and passkey
    register/authenticate flows delegate to repository methods with tests;
    `AUDIT-REPORT.md` E6 note updated (no longer "~10% / 4 repos").

- **P1.5 — Production worker topology enforcement (operational)** _(partial — P1.2 code shipped; deploy enforcement open)_
  - **Where:** `src/jobs/topology.ts`, `src/worker.ts`, `docs/deployment.md`,
    `docs/reference-architecture.md`.
  - **Why:** P1.2 shipped `WORKER_MODE` gating, startup warnings, and
    `workerTopology.test.ts`; schedulers still run in-process on API replicas
    unless operators set `WORKER_MODE=true` in production deploys.
  - **Acceptance:** Deploy blueprints default API to `WORKER_MODE=true`; exactly
    one worker process documented.

### P2 — Maintainability and refactoring

- **P2.4 — Fix API↔UI integration scanner accuracy**
  - **Where:** `scripts/audit-api-ui-map.mjs`, `docs/api-ui-integration-matrix.md`.
  - **Why:** Scanner reports **44** frontend calls but many paths use
    `build*Path()` helpers (`adminFeedback.ts`, `adminJitGrants.ts`,
    `adminContent.ts`, `adminWebhooks.ts`, `regions.ts`) and exported `*_PATH`
    constants — not detected. `PRODUCT_SURFACE_DISPOSITIONS` still marks routes
    as "API-only" that now have dashboard pages (P2.3).
  - **Acceptance:** Scanner follows `build*Path` return prefixes + `*_PATH`
    constants; dispositions trimmed to truly SDK-only routes (`/auth/unsubscribe`,
    `POST /wallet/spend`); matrix regen shows ≥55 frontend calls; CI
    `git diff --exit-code docs/api-ui-integration-matrix.md` passes.

- **P2.5 — Reconcile stale audit / status docs**
  - **Where:** `docs/AUDIT.md` (M3/P2/P4 statuses), `AUDIT-REPORT.md` (E5/E6),
    `README.md` (still cites **826** tests / 7 ADRs), `docs/ARCHITECTURE.md`
    (P1–P6 proposals partially shipped).
  - **Why:** Docs contradict `tdone.md` and mislead fork consumers.
  - **Acceptance:** Standing audit table statuses match shipped work; README stats
    match scorecard (1065 tests, 8 ADRs); ARCHITECTURE "Proposed upgrades" marks
    shipped items.

- **P2.6 — Server-state tests for untested P2.3 modules**
  - **Where:** `packages/ui/src/lib/server-state/adminContent.ts`,
    `adminWebhooks.ts` (tanstack tracker shows "—" verification).
  - **Why:** P2.3 pages shipped without focused server-state tests unlike
    `adminFeedback`, `adminRoles`, `adminSearch`.
  - **Acceptance:** `adminContent.test.tsx` + `adminWebhooks.test.tsx` with
    loading/error/mutation cases; added to `tanstack-query-progress.md`.

- **P2.7 — `serverApiClient` / RSC prefetch tests**
  - **Where:** `packages/ui/src/lib/serverApiClient.ts`,
    `packages/ui/src/lib/server-state/prefetch.ts`.
  - **Why:** P3.4 pilot shipped with **zero** tests; `docs/ui-http-client.md`
    recommends mocking `serverApiGet` but none exist.
  - **Acceptance:** Unit tests for cookie auth header, error mapping, and at
    least one prefetch options factory.

### P3 — Scalability and performance

- **P3.6 — Expand RSC server prefetch beyond pilot (2 pages)**
  - **Where:** `packages/ui/src/app/dashboard/page.tsx`, `admin/page.tsx` (done);
    candidates: `dashboard/wallet`, `dashboard/billing`, `admin/users`,
    `admin/sessions` per `docs/ui-http-client.md` pattern.
  - **Why:** P3.4 proved HydrationBoundary pattern; most pages still client-fetch
    on mount (waterfall TTFB).
  - **Acceptance:** ≥4 additional high-traffic pages prefetch; shared
    `FooClient.tsx` split documented; no duplicate fetch on hydration.

- **P3.7 — UI test coverage ratchet toward 85%**
  - **Where:** `packages/ui/vitest.config.ts` (42% lines floor), 15/54 `page.test.tsx`
    files today.
  - **Why:** Scorecard §3 target is 85%; gaps on wallet, webhooks, support,
    api-keys, notifications, admin feedback/roles/jit-grants/content/webhooks,
    revenue, alerts, tenants, access-reviews detail, etc.
  - **Acceptance:** Raise UI ratchet +5 pts; add page tests for top 8 untested
    traffic pages; scorecard §3 updated.

- **P3.8 — API coverage ratchet toward 85%** _(partial — floors at 63%/56%; ~64% measured)_
  - **Where:** `vitest.config.ts` (63% lines / 56% branches); measured 64.2% / 56.3%.
  - **Why:** P4.1 raised floors once; long-term gate is 85% not yet reached.
  - **Acceptance:** Increment thresholds +2 pts with green `bun run test:coverage`;
    scorecard trend row updated.

- **P3.9 — Playwright E2E expansion**
  - **Where:** `packages/ui/e2e/` (3 specs: auth, public, dashboard-polish); CI
    `e2e-ui` job exists but scorecard E2E = _TBD_.
  - **Why:** Only smoke coverage for billing, admin users, org flows — no E2E for
    webhooks, wallet, MFA security page, admin product-surface pages.
  - **Acceptance:** ≥3 new specs for critical flows; scorecard §3 E2E row populated.

- **P3.10 — Load/chaos scorecard baselines** _(partial — 6 k6 scripts + CI job exist; baselines _TBD_)_
  - **Where:** `tests/load/`, CI `load-test` job (`continue-on-error: true`),
    `docs/maintenance-scorecard.md` §3/§6.
  - **Why:** k6 runs in CI but scorecard p95/p99 rows and prod metrics are _TBD_.
  - **Acceptance:** Document p95/p99 baselines from CI load job; optional badge in
    scorecard.

### P4 — Documentation and developer experience

- **P4.6 — Fix Trivy CI gate (currently non-blocking)**
  - **Where:** `.github/workflows/ci.yml` (`continue-on-error: true` on Trivy;
    `docs/deployment.md` notes broken binary install).
  - **Why:** Filesystem CVE scan provides no signal when install fails before scan.
  - **Acceptance:** Pin working `trivy-action`/binary combo; flip to blocking or
    remove job; scorecard §7 security exceptions updated.

- **P4.7 — Resolve Semgrep SAST exception**
  - **Where:** `.github/workflows/ci.yml`, `docs/maintenance-scorecard.md` §7
    (SAST-Semgrep triaged Low, opened 2026-06).
  - **Why:** Open security exception on scorecard.
  - **Acceptance:** Semgrep green on `main` or findings documented/suppressed with
    rationale; scorecard row closed.

- **P4.8 — Populate maintenance scorecard TBD baselines**
  - **Where:** `docs/maintenance-scorecard.md` (CI success rate, flaky tests,
    E2E, k6, backup drill, prod latency — all _TBD_).
  - **Why:** P4.4 created template; most rows never filled.
  - **Acceptance:** At least CI duration + test count + migration count filled
    from GitHub Actions; quarterly review date set.

- **P4.9 — ADR 008 fork path: optional BFF/httpOnly token storage** _(intentionally unshipped in default template)_
  - **Where:** `docs/adr/008-token-storage-design-revisit.md`,
    `packages/ui/src/lib/auth.ts`, `apiClient.ts` (no `app/api/auth/` BFF route).
  - **Why:** ADR 008 accepts `localStorage` default; forks needing httpOnly cookies
    lack a documented or optional BFF implementation path.
  - **Acceptance:** Either ship optional `app/api/auth/[...path]/route.ts` BFF
    behind `NEXT_PUBLIC_BFF_AUTH=true`, or add `docs/extending.md` §BFF migration
    checklist (explicit non-default).

### P5 — Compliance and security hardening

- **P5.1 — Audit log external anchoring**
  - **Where:** `docs/compliance/audit-log-anchoring-plan.md` (design only);
    `src/audit/chain.ts`.
  - **Why:** Hash-chain is in-DB; anchoring to object storage/transparency log
    strengthens tamper evidence for SOC 2.
  - **Acceptance:** Scheduled anchor job + verification command + test; evidence
    slot in `docs/compliance/evidence/`.

- **P5.2 — Compliance evidence program (operational)**
  - **Where:** `docs/compliance/README.md` — policies pending approval, vendor
    register TBD, restore drill TBD, incident tabletop TBD, evidence-register open.
  - **Why:** Product controls ship; audit evidence does not.
  - **Acceptance:** Vendor register populated; one restore drill + tabletop
    recorded in `docs/compliance/evidence/YYYY/`; policies approval date set.

- **P5.3 — Hardware key-store providers remain stubs (document/clarify)**
  - **Where:** `src/crypto/hardware-key-store.ts` (TPM / Secure Enclave / PKCS#11
    throw on use); `tdone.md` marks post-quantum `[~]` but no `src/crypto` PQC code.
  - **Why:** README/claims vs implementation gap for security-sensitive forks.
  - **Acceptance:** README + `tdone.md` explicitly "software CSFLE only"; remove or
    relocate `[~]` post-quantum line unless provider code lands.

---
