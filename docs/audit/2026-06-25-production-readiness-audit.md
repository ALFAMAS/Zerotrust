# Production-Readiness Audit — 2026-06-25

**Scope:** `src/` (API, 47k LOC, 31 route modules, 70+ services), `packages/ui`,
`tests/`, CI config, and the observability/perf surfaces called out in the
program goal (p95 < 100 ms, Lighthouse > 90, >85% coverage, 100% shadcn,
full FE↔BE wiring, observability/DR/CI-CD).

**Method:** static review of the hot request path and bootstrap; `bun install`
+ `bun run type-check` (green); targeted Vitest runs; `biome check`; manual
trace of metrics wiring against the README's advertised feature set. No load
test was run in this environment (no Postgres/Redis); load numbers are to be
captured on staging with the harness in `tests/load/` — see §5.

This audit is the first deliverable of the program. It is **paired with a PR**
that fixes the three highest-severity hot-path/observability findings (P0–P2
below) with tests. Remaining findings are laid out as a phased, owned plan in
§6.

---

## 1. Severity summary

| ID  | Severity | Area          | Finding                                                              | Status (this PR) |
| --- | -------- | ------------- | ------------------------------------------------------------------- | ---------------- |
| P0  | High     | Observability | `/metrics` never mounted **and** served the wrong (empty) registry  | ✅ Fixed         |
| P1  | High     | Performance   | `UPDATE sessions.last_activity_at` on **every** authed request      | ✅ Fixed         |
| P2  | Medium   | Performance   | No HTTP response compression (JSON-heavy API)                       | ✅ Fixed         |
| P3  | Medium   | Performance   | Auth hot path does up to 4 sequential DB round-trips per request    | ▶ Planned (§6.2) |
| P4  | Medium   | Testing       | Coverage gate at 80/80/70/80; goal is >85% incl. security/perf      | ▶ Planned (§6.1) |
| P5  | Low      | Security      | `/metrics` exposure unauthenticated by default                      | ✅ Mitigated     |
| P6  | Low      | Ops           | No app-level perf SLI dashboard wired to the new histogram          | ▶ Planned (§6.4) |

> "Status (this PR)" reflects the accompanying change set. P3/P4/P6 are scoped
> with owners and milestones in §6 rather than rushed into one PR.

---

## 2. P0 — Prometheus `/metrics` was advertised but non-functional (High)

**Two stacked defects** made the README's "Prometheus metrics" claim false:

1. **Never mounted.** `metricsMiddleware()` and `metricsRoute` were exported
   from `src/metrics` but **never registered** on the Hono app in
   `src/api/server.ts`. A Prometheus scrape of `/metrics` returned 404, and the
   `zerotrust_request_duration_seconds` histogram — the one metric you need to
   compute the program's p95 SLO — was **never observed**.
2. **Wrong registry.** `metricsRoute` served prom-client's **default**
   `register`, but every `zerotrust_*` metric is registered on the **custom**
   `metricsRegistry` (`src/metrics/registry.ts`; `slo.service.ts` already reads
   that one). So even if mounted, the scrape would have been empty.

**Impact:** zero runtime observability; the p95 exit criterion was not even
*measurable*. This is the single most important fix for the whole program,
because every later performance claim has to be measured against this endpoint.

**Fix (this PR):**

- Mount `metricsMiddleware()` as the **outermost** middleware in
  `server.ts` (times full server-side latency including compression).
- Point `metricsRoute` at `metricsRegistry`.
- Expose `app.get("/metrics", metricsAuthMiddleware(), metricsRoute)`.
- Tests: `src/__tests__/metrics.route.test.ts` asserts a request is recorded
  and that `zerotrust_request_duration_seconds{route="/probe"}` appears in the
  scrape — i.e. a regression on either defect fails the build.

The histogram's buckets (`…0.05, 0.1, 0.25…`) already straddle the 100 ms SLO
target, so `histogram_quantile(0.95, …)` works out of the box.

---

## 3. P1 — Write-on-every-read in the auth hot path (High, performance)

`authMiddleware` ran on every authenticated request and ended with an
**unconditional** `UPDATE sessions SET last_activity_at = now()`
(`src/middleware/auth.ts`). Consequences on the exact endpoints the program
targets (auth/org, under load):

- **Every read becomes a write** — doubles DB write volume and serializes a
  round-trip into p95.
- **Row churn / dead tuples** on the hottest table → vacuum pressure, index
  bloat, replica lag.

**Fix (this PR):** throttle the write. `last_activity_at` is now refreshed at
most once per window (`SESSION_ACTIVITY_REFRESH_SECONDS`, default 60 s). The
window is auto-clamped to **half the org idle-timeout** when one is configured,
so idle-session enforcement in `evaluateSessionPolicy` (which reads
`last_activity_at`) never drifts by more than half its budget — correctness is
preserved while ~all activity writes on hot sessions disappear.

- Pure decision functions `shouldRefreshActivity()` / `activityRefreshSeconds()`
  are extracted and unit-tested (14 cases incl. boundary, invalid-date
  fail-open, env override, idle clamp) in
  `src/__tests__/session-activity-throttle.test.ts`.

**Expected effect:** for a session making N requests inside the window, session
writes drop from **N → 1**. On a read-heavy authed workload this removes the
majority of writes the middleware issues. Quantify on staging via the k6 harness
(§5) reading the now-working `/metrics`.

---

## 4. P2 — No response compression (Medium, performance)

The bootstrap had `cors` + `secureHeaders` but **no compression**, and the
reference nginx config in the README does not set `gzip on`. The API is
JSON-heavy (admin lists, audit, search) — exactly the payloads that compress
70–90%.

**Fix (this PR):** `src/middleware/compression.ts` wraps Hono's `compress()`
(gzip/deflate, 1 KB threshold, skips already-encoded bodies). SSE is protected
**twice**: Hono's content-type filter already excludes `text/event-stream`, and
we additionally bypass the middleware when the client sends
`Accept: text/event-stream`, so long-lived `/status/stream` and notification
streams are never buffered. Verified by
`src/__tests__/compression.middleware.test.ts` (JSON compresses; `identity`
doesn't; SSE never does).

> Behind a compressing proxy you can drop this and use `gzip on;` at nginx —
> documented inline in the middleware and in `.env`/README follow-ups (§6).

---

## 5. Measuring the targets (staging procedure for the human leads)

The p95 SLO is now measurable. On staging, with the API reachable:

```bash
# 1. Confirm the scrape works and the histogram exists
curl -s "$BASE_URL/metrics" | grep zerotrust_request_duration_seconds | head

# 2. Drive load (existing harness)
k6 run -e BASE_URL=$BASE_URL tests/load/full-suite.k6.js

# 3. p95 for auth/org endpoints, from Prometheus (or the k6 summary):
#    histogram_quantile(0.95,
#      sum(rate(zerotrust_request_duration_seconds_bucket{route=~"/auth.*|/orgs.*"}[5m])) by (le))
```

Capture before/after by running step 2–3 against the previous `main` image and
this branch's image. **Owner: human lead (deploy) + AI (analysis).** Record the
numbers back into this file's §7 table.

---

## 6. Phased plan for the remaining program (owners + milestones)

Severity ranks: do P3/P4 first (Week 1–2), then the UI/integration tracks.

### 6.1 Test suite to >85% (Week 1) — Owner: AI, review: human

- Raise vitest thresholds 80→85 (lines/stmts), 70→80 (branches) **after** the
  gap is closed, not before (avoids a red gate).
- Add: auth-middleware integration test (throttle path against a test DB),
  compression on the real server, security regressions for PASETO/CSFLE/abuse
  defenses (assert they still reject tampered/replayed tokens).
- Wire k6 thresholds (`http_req_duration: p(95)<100`) as a **failing** CI gate
  on staging, not `continue-on-error`.

### 6.2 P3 — Auth hot-path round-trips (Week 2) — Owner: AI

- The path issues: session lookup → effective policy → (maybe) concurrent-cap →
  user lookup → (now-throttled) activity write. Fold the user+session reads, and
  cache the **effective session policy** and **user row** in Redis behind a
  short TTL keyed by `sid`/`uid`, invalidated on session revoke / role change.
- Target: ≤1 DB round-trip on a warm authed request. Measure via `/metrics`.

### 6.3 Integration completeness (Week 3) — Owner: AI + human review

- Diff every `packages/ui` API call against mounted routes; list unmounted
  features; regenerate the SDK (`bun run sdk:generate`) and adopt it in the UI;
  standardize error envelopes (`{ error, message }` is already the norm — codify
  it).

### 6.4 Observability & DR (Week 2) — Owner: human (infra) + AI (code)

- Ship a Grafana panel JSON for `zerotrust_request_duration_seconds` p50/p95/p99
  and the auth/session counters; wire alert rules to the existing SLO service.
- Validate `bun run db:backup` → `db:restore` round-trip on staging; write the
  DR runbook timing (RTO/RPO) into `docs/compliance/`.

### 6.5 UI / shadcn + a11y (Week 3) — Owner: AI

- The 2026-06-24 ledger shows shadcn migration largely done; finish the audit by
  running `axe` in Playwright across all routes and adding visual-regression
  snapshots. Gate Lighthouse > 90 in CI against staging.

---

## 7. Before/after ledger (fill on staging)

| Metric                              | Before | After | Notes                         |
| ----------------------------------- | ------ | ----- | ----------------------------- |
| `/metrics` scrape works             | ❌ 404 | ✅    | P0                            |
| Session writes / N hot requests     | N      | 1     | P1 (analytical; confirm)      |
| p95 `/auth/*` under k6 load         | TBD    | TBD   | capture per §5                |
| p95 `/orgs/*` under k6 load         | TBD    | TBD   | capture per §5                |
| Avg JSON response bytes (list APIs) | TBD    | TBD   | gzip on; capture per §5       |

---

*Generated as Deliverable 1 of the production-grade hardening program. The
accompanying PR implements P0–P2 + P5 with tests; type-check and the touched
test suites are green.*
