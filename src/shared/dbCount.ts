/**
 * Shared COUNT(*) helper.
 *
 * Collapses the repeated count-query boilerplate:
 *
 *   const [{ count }] = await db
 *     .select({ count: sql<number>`count(*)::int` })
 *     .from(table)
 *     .where(where);
 *   const total = count ?? 0;
 *
 * into a single call:
 *
 *   const total = await countRows(db, table, where);
 *
 * It returns a promise, so it composes inside a `Promise.all` next to the
 * page query used by `paginated()`:
 *
 *   const [rows, total] = await Promise.all([
 *     db.select().from(table).where(where).offset(offset).limit(limit),
 *     countRows(db, table, where),
 *   ]);
 *   return c.json(paginated(rows, { page, limit, total }));
 */
import { type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { getDb } from "../db";

type Db = ReturnType<typeof getDb>;

/**
 * Count rows in `table`, optionally filtered by `where`.
 *
 * @param db    A Drizzle connection (primary or read replica).
 * @param table The table to count.
 * @param where Optional WHERE clause; omit/`undefined` counts the whole table.
 * @returns The row count as a number (0 when the table is empty).
 */
export async function countRows(db: Db, table: PgTable, where?: SQL): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(where);
  return rows[0]?.count ?? 0;
}
