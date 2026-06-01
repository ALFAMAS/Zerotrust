import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { getConfig } from "../config";

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
    console.log("Database already connected");
    return;
  }

  const cfg = getConfig();
  const url = cfg.database.databaseUrl;

  console.log(`Connecting to PostgreSQL at ${url.replace(/:([^@/]+)@/, ":***@")}`);

  try {
    sqlClient = postgres(url, {
      max: cfg.database.connectionPoolSize,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    dbInstance = drizzle(sqlClient, { schema });
    isConnected = true;
    console.log("✓ Database connected successfully");
  } catch (error) {
    console.error("✗ Failed to connect to database:", error);
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  if (!isConnected || !sqlClient) return;

  try {
    console.log("Closing database connection...");
    await sqlClient.end();
    dbInstance = null;
    sqlClient = null;
    isConnected = false;
    console.log("✓ Database connection closed");
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

  const db = getDb();
  await sqlClient!`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `;
  console.log("✓ All tables truncated");
}
