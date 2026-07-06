# zerotrust — TODO

## Security baseline (`docs/security.md`)

Audit date: **2026-07-05**. Verified/completed items moved to [`tdone.md`](./tdone.md) § Security baseline audit.

**Verification (2026-07-05, re-audited):** SEC-17…SEC-27 rechecked — **2 items remain open** below (1 SEC + DQ-2). **SEC-1…SEC-16 shipped 2026-07-05** → [`tdone.md`](./tdone.md) § Security baseline audit (SEC-14: `@hono/zod-validator`; SEC-15: per-user rate limit; SEC-16: log redaction). **SEC-20…SEC-26 shipped 2026-07-05** → [`tdone.md`](./tdone.md) § Security baseline audit. **SEC-28** (Expo out-of-scope) documented → [`tdone.md`](./tdone.md). DQ-2 unchanged.

### Low / Ops (document + deploy)

- [ ] **SEC-27** — **Low** — VPS firewall / private Postgres+Redis binding (§9)

       **Problem:** Codebase documents Coolify/VPS deploy but ufw/default-deny and private DB interfaces are operator runbook items, not verified in repo automation.

       **Fix:** Add/check deploy checklist in `docs/deployment.md` with ufw + bind-address steps; optional CI doc lint.

       **Paths:** `docs/deployment.md`, `docs/reference-architecture.md`

       **Refs:** §9 Ops

- [ ] **DQ-2** — **Low** — Test coverage below stated 85% target

       **Problem:** API coverage ~64.6% lines / ~55.5% branches; UI ~54.6% lines vs 85% long-term aspiration in `docs/maintenance-scorecard.md`.

       **Fix:** Continue incremental ratchet in `vitest.config.ts` / `packages/ui/vitest.config.ts`; raise floors over time.

       **Paths:** `vitest.config.ts`, `packages/ui/vitest.config.ts`, `docs/maintenance-scorecard.md`, `.github/workflows/ci.yml`

       **Status (2026-07-05):** Floors aligned to measured baseline (API 64/61/55/63; UI 54/52/46/51). Long-term 85% target — incremental ratchet ongoing.

## Backlog (unprioritized)

CSP / security-headers middleware (from BoxyHQ). Zerotrust's API is Bearer-only so the risk is lower than for a cookie app, but the Next.js UI would still benefit from an explicit CSP.
CAPTCHA hook on the hottest auth endpoints (from BoxyHQ / better-auth's captcha plugin) as a bot backstop layered on the existing rate limits — an option flag, not a default.

Dead-code and dependency CI checks (knip, from ixartz — carried over from v1 of this review; still not adopted). Would have mechanically caught the M9 vestigial tenant layer and future orphans like it.

Atomic rate-limit consume for DB storage (from better-auth's rate limiter, which documents its increment race and guards it). Zerotrust's Redis path is atomic; the in-memory fallback is fine per-process — worth a note in the code, nothing more.
