# Phase 2 — Performance and Observability

Date: 2026-06-25  
Goal: reduce hot-path latency and add repeatable operational smoke checks before staging load validation.

## Implemented in this phase

| Workstream | Deliverable | Expected impact |
|---|---|---|
| Response compression | API-wide Hono compression middleware after secure headers. | Reduces transfer time for JSON/HTML/text responses without changing route contracts. |
| Hot-path indexes | Migration `0019_hot_path_indexes.sql` and matching Drizzle schema indexes for refresh-token and organization-membership lookups. | Speeds auth refresh/reuse detection, session cleanup by session id, and org membership/role checks. |
| Prometheus route | Mounted `metricsMiddleware()` and `GET /metrics` in the API server. | Makes request latency/error metrics scrapeable in the runnable app, not just exported from the package. |
| Operations smoke | `scripts/ops-smoke.mjs` and `bun run ops:smoke` check `/health`, `/metrics`, and `/api/versions`. | Gives humans and CI a fast staging sanity check for health, Prometheus metrics, and API version metadata. |

## Benchmark protocol

Use the same seed data before and after each optimization:

```bash
# Local or staging API
API_URL=http://localhost:1337 bun run ops:smoke
k6 run tests/load/full-suite.k6.js -e BASE_URL=http://localhost:1337
```

Record these in the PR or release evidence:

| Metric | Before | After | Target |
|---|---:|---:|---:|
| Auth login p95 | TBD | TBD | <100ms |
| Token refresh p95 | TBD | TBD | <100ms |
| Org/member read p95 | TBD | TBD | <100ms |
| API error rate | TBD | TBD | <1% |
| `/metrics` scrape success | TBD | TBD | 100% |

## Human staging instructions

1. Apply migration `0019_hot_path_indexes.sql` to staging Postgres.
2. Deploy the API with compression enabled by default.
3. Run `API_URL=<staging-api> bun run ops:smoke`.
4. Run k6 with the same seeded users used in Phase 1.
5. Attach k6 JSON output and Postgres query-plan samples for refresh-token and organization-membership queries.

## Next phase entry criteria

- Staging `/health`, `/metrics`, and `/api/versions` pass the smoke script.
- Migration completes without lock-timeout or duplicate-index errors.
- k6 shows whether strict p95 <100ms can become a blocking CI gate or must remain staging-only until more caching work lands.
