import { getDb, getReadDb } from "../index";

/**
 * Repository-layer database accessors.
 *
 * Use `readDb()` for SELECT-heavy list/detail paths (routes to
 * `DATABASE_URL_READ_REPLICA` when configured). Use `writeDb()` for
 * mutations and reads that must reflect a write in the same request.
 */
export function writeDb() {
  return getDb();
}

export function readDb() {
  return getReadDb();
}
