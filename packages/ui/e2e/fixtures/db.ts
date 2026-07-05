import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = resolve(__dirname, "..", "..", "..", "..", ".env");
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("DATABASE_URL=")) {
      return trimmed.slice("DATABASE_URL=".length).trim();
    }
  }

  throw new Error("DATABASE_URL not found for e2e DB helpers");
}

async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(getDatabaseUrl());
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

export async function grantAdminRole(userId: string): Promise<void> {
  await withDb(async (sql) => {
    await sql`
      UPDATE users
      SET roles = CASE
        WHEN 'admin' = ANY(roles) THEN roles
        ELSE array_append(roles, 'admin')
      END
      WHERE id = ${userId}::uuid
    `;
  });
}

export async function verifyUserEmail(userId: string): Promise<void> {
  await withDb(async (sql) => {
    await sql`
      UPDATE users
      SET email_verified_at = NOW()
      WHERE id = ${userId}::uuid
    `;
  });
}
