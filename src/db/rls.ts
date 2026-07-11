import type { ExtractTablesWithRelations } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { getDb, getReadDb } from "./index";
import type * as schema from "./schema";

export const RLS_ORG_SETTING = "app.org_id";
export const RLS_USER_SETTING = "app.user_id";
export const RLS_BYPASS_SETTING = "app.rls_bypass";

export interface OrgRlsContext {
  orgId?: string | null;
  userId?: string | null;
  /** Platform admin / worker / migration paths that must see all rows. */
  bypass?: boolean;
}

type DbTx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type OrgRlsTx = DbTx;

/**
 * Set transaction-local RLS session variables (Postgres `set_config(..., true)`).
 * Must run inside the same transaction as subsequent org-scoped queries.
 */
export async function setOrgRlsContext(
  tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
  ctx: OrgRlsContext
): Promise<void> {
  if (ctx.bypass) {
    await tx.execute(sql`SELECT set_config(${RLS_BYPASS_SETTING}, 'on', true)`);
    await tx.execute(sql`SELECT set_config(${RLS_ORG_SETTING}, '', true)`);
    await tx.execute(sql`SELECT set_config(${RLS_USER_SETTING}, '', true)`);
    return;
  }

  await tx.execute(sql`SELECT set_config(${RLS_BYPASS_SETTING}, '', true)`);
  await tx.execute(sql`SELECT set_config(${RLS_ORG_SETTING}, ${ctx.orgId ?? ""}, true)`);
  await tx.execute(sql`SELECT set_config(${RLS_USER_SETTING}, ${ctx.userId ?? ""}, true)`);
}

/** Run `fn` inside a transaction with org RLS context applied. */
export async function withOrgRls<T>(ctx: OrgRlsContext, fn: (tx: DbTx) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await setOrgRlsContext(tx, ctx);
    return fn(tx);
  });
}

/** Read-replica variant of `withOrgRls` for SELECT-heavy repository methods. */
export async function withOrgRlsRead<T>(
  ctx: OrgRlsContext,
  fn: (tx: DbTx) => Promise<T>
): Promise<T> {
  const db = getReadDb();
  return db.transaction(async (tx) => {
    await setOrgRlsContext(tx, ctx);
    return fn(tx);
  });
}

/** Worker / admin / migration paths that must read or write across all org rows. */
export async function withRlsBypass<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
  return withOrgRls({ bypass: true }, fn);
}
