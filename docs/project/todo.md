# zerotrust — TODO

## Security baseline (`docs/security.md`)

Audit date: **2026-07-05**. Verified/completed items moved to [`shipped.md`](./shipped.md) § Security baseline audit. **No open SEC items** — **DQ-2** (coverage gate alignment) shipped 2026-07-09.

---

## Production readiness (`docs/production-checklist.md`)

Audit date: **2026-07-07**. Open gaps from [`production-checklist.md`](../production-checklist.md) rows marked **Partial**, **Missing**, or **Unknown** (Done rows omitted).

**Verification (2026-07-09):** **1** open item remains (FE-1). AUTH-1 shipped 2026-07-09 → [`shipped.md`](./shipped.md) § Recent work.

### Security

_(none — AUTH-1 shipped 2026-07-09)_

### Frontend

- [ ] **FE-1** — **P2** — shadcn redesign completion

       **Problem:** UI redesign to shadcn components is in progress; not all dashboard/admin surfaces migrated.

       **Fix:** Continue migration per frontend-design skill; track page-level completion in PRs.

       **Paths:** `packages/ui/src/components/ui/`, `packages/ui/src/app/`

       **Status:** Partial.

       **Refs:** [`production-checklist.md`](../production-checklist.md) § Frontend


## Backlog (unprioritized)

_(empty — see [`shipped.md`](./shipped.md) § Recent work)_
