# zerotrust — TODO

## Security baseline (`docs/security.md`)

Audit date: **2026-07-05**. Verified/completed items moved to [`shipped.md`](./shipped.md) § Security baseline audit. **No open SEC items** — **DQ-2** (coverage gate alignment) shipped 2026-07-09.

---

## Production readiness (`docs/production-checklist.md`)

Audit date: **2026-07-07**. Open gaps from [`production-checklist.md`](../production-checklist.md) rows marked **Partial**, **Missing**, or **Unknown** (Done rows omitted).

**Verification (2026-07-09):** **3** open items remain (AUTH-1, CRYPTO-1, FE-1). The 2026-07-07 audit tracked 18 gaps; CI-2, DOC-1, SEC-27, OPS-1, OPS-2, INF-1, INF-2, INF-3, PERF-1, PERF-2, OBS-1, CI-1, DX-2, DB-1, and DQ-2 shipped 2026-07-08–09 → [`shipped.md`](./shipped.md) § Recent work.

### Security

- [ ] **AUTH-1** — **P2** — Apple Sign In

       **Problem:** Env placeholders exist in `.env.example` but no Apple OAuth provider is implemented.

       **Fix:** Add `plugins/oauth/providers/apple.ts` and wire provider toggle in admin auth settings.

       **Paths:** `plugins/oauth/`, `.env.example`, `packages/ui/src/app/admin/auth-settings/`

       **Status:** Missing.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Security

- [ ] **CRYPTO-1** — **P2** — Hardware key store (TPM/HSM)

       **Problem:** Only software CSFLE/key-store stubs exist; no TPM, Secure Enclave, or PKCS#11 integration.

       **Fix:** Implement or document fork path in `src/crypto/hardware-key-store.ts`; clarify README scope (P5.3 partial).

       **Paths:** `src/crypto/hardware-key-store.ts`, `README.md`

       **Status:** Partial — stubs only.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Security

### Frontend

- [ ] **FE-1** — **P2** — shadcn redesign completion

       **Problem:** UI redesign to shadcn components is in progress; not all dashboard/admin surfaces migrated.

       **Fix:** Continue migration per frontend-design skill; track page-level completion in PRs.

       **Paths:** `packages/ui/src/components/ui/`, `packages/ui/src/app/`

       **Status:** Partial.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Frontend


## Backlog (unprioritized)

_(empty — see [`shipped.md`](./shipped.md) § Recent work)_
