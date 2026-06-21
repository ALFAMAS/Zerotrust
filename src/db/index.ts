import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getConfig } from "../config";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: DrizzleDb | null = null;
let sqlClient: ReturnType<typeof postgres> | null = null;
let isConnected = false;

export function getDb(): DrizzleDb {
  if (!dbInstance) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return dbInstance;
}

export async function initializeDatabase(): Promise<void> {
  if (isConnected && dbInstance) {
    return;
  }

  const cfg = getConfig();
  const url = cfg.database.databaseUrl;

  try {
    sqlClient = postgres(url, {
      max: cfg.database.connectionPoolSize,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    dbInstance = drizzle(sqlClient, { schema });
    isConnected = true;
  } catch (error) {
    console.error("✗ Failed to connect to database:", error);
    throw error;
  }
}

/**
 * Startup migration check.
 *
 * Compares the schema the running code expects (every pgTable defined in
 * `./schema`) against the columns actually present in the database, and warns
 * loudly when tables or columns are missing — i.e. when migrations have not
 * been applied. This is workflow-agnostic: it works whether the database is
 * kept in sync with `db:migrate` (which records `drizzle.__drizzle_migrations`)
 * or with `db:push` (which does not), so it catches schema drift either way.
 *
 * Best-effort: any failure is logged but never blocks startup.
 */
export async function checkPendingMigrations(): Promise<void> {
  if (!isConnected || !sqlClient) return;

  try {
    const tables = Object.values(schema).filter((v) => is(v, PgTable)) as PgTable[];
    if (tables.length === 0) return;

    // Single round-trip: every column currently present in the public schema.
    const rows = await sqlClient<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;

    const actual = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!actual.has(r.table_name)) actual.set(r.table_name, new Set());
      actual.get(r.table_name)?.add(r.column_name);
    }

    const missingTables: string[] = [];
    const missingColumns: string[] = [];

    for (const table of tables) {
      const name = getTableName(table);
      const cols = actual.get(name);
      if (!cols) {
        missingTables.push(name);
        continue;
      }
      for (const col of Object.values(getTableColumns(table))) {
        if (!cols.has(col.name)) missingColumns.push(`${name}.${col.name}`);
      }
    }

    if (missingTables.length === 0 && missingColumns.length === 0) {
      return;
    }

    console.warn("⚠ Database schema is out of date — pending migrations detected:");
    if (missingTables.length > 0) {
      console.warn(`  Missing tables: ${missingTables.join(", ")}`);
    }
    if (missingColumns.length > 0) {
      console.warn(`  Missing columns: ${missingColumns.join(", ")}`);
    }
    console.warn('  Run "bun run db:migrate" (or "bun run db:push") to update the database.');
  } catch (error) {
    // The check must never prevent the server from starting.
    console.warn("⚠ Could not verify database migrations:", (error as Error).message);
  }
}

export async function closeDatabase(): Promise<void> {
  if (!isConnected || !sqlClient) return;

  try {
    await sqlClient.end();
    dbInstance = null;
    sqlClient = null;
    isConnected = false;
  } catch (error) {
    console.error("✗ Error closing database:", error);
    throw error;
  }
}

export async function checkDatabaseHealth(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  connections: { current: number; available: number };
}> {
  if (!isConnected || !dbInstance) {
    return { status: "unhealthy", uptime: 0, connections: { current: 0, available: 0 } };
  }

  try {
    const result = await sqlClient!`SELECT extract(epoch from now())::int as ts`;
    if (result.length > 0) {
      return { status: "healthy", uptime: 0, connections: { current: 1, available: 99 } };
    }
    return { status: "degraded", uptime: 0, connections: { current: 0, available: 0 } };
  } catch {
    return { status: "degraded", uptime: 0, connections: { current: 0, available: 0 } };
  }
}

export function isDbConnected(): boolean {
  return isConnected && dbInstance !== null;
}

export async function dropAllTables(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot drop tables in production");
  }

  await sqlClient!`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `;
}
