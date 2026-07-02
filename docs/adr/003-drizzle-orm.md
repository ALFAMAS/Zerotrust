# ADR 003: Drizzle ORM as Database Source of Truth

**Status:** Accepted
**Date:** 2026-01 (initial), documented 2026-07-01
**Deciders:** Project maintainers

## Context

The database layer needs to:

- Produce a typed, autocompletable query surface from the schema.
- Support migrations that can be reviewed in PRs (plain SQL, not generated-only).
- Work with PostgreSQL-specific features (GIN indexes, JSONB, `ON CONFLICT`,
  `RETURNING`, read replicas).
- Avoid runtime schema-reflection overhead — schema should be known at compile
  time.
- Run on Bun (the project's package manager and preferred runtime).

## Decision

Use **Drizzle ORM** with the `postgres` driver as the canonical database layer.

- Schema is defined as TypeScript (`src/db/schema.ts`) → a single source of
  truth for both the query surface and the migration journal.
- Migrations are plain SQL files in `drizzle/*.sql` — human-reviewable and
  safe to hand-edit when needed (e.g. adding `CONCURRENTLY` to index creation).
- `db.transaction` (via Drizzle's `tx`) is used for multi-statement atomicity;
  the repository layer (`src/db/repositories/`) wraps hot-path multi-statement
  Hot-path writes use repository methods that own `db.transaction` (P1.1).
- Read-replica routing (`getReadDb()`) is opt-in per call site, with
  `READ_REPLICA_URL` as an optional env var.

## Alternatives considered

| Option | Why rejected |
|---|---|
| **Prisma** | Heavier runtime, Bun support was historically a pain point, and generated migrations are opaque diffs — harder to review and hand-edit. |
| **Knex / raw SQL** | Full control but no type-safe query building — column renames break silently instead of at compile time. |
| **TypeORM / MikroORM** | Active-record / data-mapper patterns bring entity lifecycle overhead we don't need; decorator-based schemas are less portable. |
| **Drizzle Kit push-only (no migration files)** | Fast for prototyping but no audit trail for production changes. Versioned SQL migrations are non-negotiable. |

## Consequences

- **Positive:** Schema → query surface is end-to-end typed. Renaming a column
  in `schema.ts` produces type errors at every call site, not runtime `column
  does not exist`.
- **Positive:** Migrations are plain SQL — `drizzle-kit generate` produces
  readable, reviewable `.sql` files that can be amended before applying.
- **Positive:** The `postgres` driver (not `pg`) is built for Bun/Node
  compatibility and supports the full PostgreSQL protocol surface (prepared
  statements, `LISTEN/NOTIFY`, replication).
- **Negative:** Drizzle Kit occasionally produces `DROP … CASCADE` migrations
  that are irreversible without expand/contract discipline (TODO P3.5).
- **Negative:** `drizzle-kit` version is pinned to `0.31.10` — a breakage in
  the upstream release process (observed mid-2026) means upgrades must be
  tested carefully.

## References

- Schema: `src/db/schema.ts`
- Migrations: `drizzle/*.sql`
- Repositories: `src/db/repositories/`
- TODO: `todo.md` P3.5 (expand/contract migrations)
