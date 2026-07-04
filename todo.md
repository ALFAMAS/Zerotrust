# zerotrust — TODO

## Long-term

- [ ] **DQ-2** — **Low** — Test coverage below stated 85% target  
       **Problem:** API coverage ~64.6% lines / ~55.5% branches; UI ~54.6% lines vs 85% long-term aspiration in `docs/maintenance-scorecard.md`.  
       **Fix:** Continue incremental ratchet in `vitest.config.ts` / `packages/ui/vitest.config.ts`; raise floors over time.  
       **Paths:** `vitest.config.ts`, `packages/ui/vitest.config.ts`, `docs/maintenance-scorecard.md`, `.github/workflows/ci.yml`  
       **Status (2026-07-05):** Floors aligned to measured baseline (API 64/61/55/63; UI 54/52/46/51). Long-term 85% target — incremental ratchet ongoing.
