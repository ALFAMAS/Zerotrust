# Project status

Living documents for what ships today and what remains open. These are **not**
operator runbooks — use [`../production-checklist.md`](../production-checklist.md),
[`../deployment.md`](../deployment.md), and [`../compliance/`](../compliance/README.md)
for production and compliance work.

| File | Purpose |
| ---- | ------- |
| [`todo.md`](./todo.md) | Open backlog — security gaps (**SEC-***), quality ratchets (**DQ-***), and unprioritized items |
| [`shipped.md`](./shipped.md) | Authoritative catalog of shipped features, security baseline audit results, and recent work log |

**When to update**

- Ship a feature or close a backlog item → move the entry from `todo.md` to `shipped.md`.
- Open a new tracked gap → add to `todo.md` with ID, priority, paths, and fix notes.
- Link from PRs and release notes; do not duplicate feature lists in README (summarize only).

**Related**

- [`../maintenance-scorecard.md`](../maintenance-scorecard.md) — quarterly metrics snapshot
- [`../security.md`](../security.md) — structural security baseline (SEC-* tracking)
- [`../../README.md`](../../README.md) — repo overview and quick-start
