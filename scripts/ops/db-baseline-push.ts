#!/usr/bin/env bun
/**
 * Baseline databases provisioned via `db:push` for `db:migrate` (MIG-3).
 *
 * Applies RLS / audit-immutability SQL that push skips, backfills
 * `drizzle.__drizzle_migrations` from the committed journal, and verifies.
 *
 * Usage:
 *   bun run db:baseline-push
 *   bun run db:baseline-push -- --dry-run
 *
 * Env: DATABASE_URL (required for apply — not needed with --dry-run)
 */
import "dotenv/config";
import postgres from "postgres";
import {
  AUDIT_IMMUTABILITY_TRIGGERS,
  BASELINE_SQL_TAGS,
  buildBaselineRows,
  loadJournalEntries,
  RLS_ORG_TABLES,
  readMigrationSql,
  splitMigrationStatements,
} from "./db-baseline-push.lib";

const dryRun = process.argv.includes("--dry-run");

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("✗ DATABASE_URL is required (use migrator/superuser credentials)");
    process.exit(1);
  }
  return url;
}

async function main(): Promise<void> {
  console.info(
    dryRun
      ? "○ Dry run — no database changes will be made"
      : "→ Baselining db:push database for db:migrate"
  );

  if (dryRun) {
    for (const tag of BASELINE_SQL_TAGS) {
      const content = readMigrationSql(tag);
      logStep(
        `Apply migration SQL: ${tag} (${splitMigrationStatements(content).length} statement(s))`
      );
    }
    const journalEntries = loadJournalEntries();
    const rowsToInsert = buildBaselineRows(journalEntries, new Set());
    console.info(`○ Would baseline ${rowsToInsert.length} journal row(s)`);
    for (const row of rowsToInsert.slice(0, 5)) {
      console.info(`  - ${row.tag}`);
    }
    if (rowsToInsert.length > 5) {
      console.info(`  … and ${rowsToInsert.length - 5} more`);
    }
    console.info("○ Dry run complete — re-run without --dry-run to apply");
    return;
  }

  const databaseUrl = requireDatabaseUrl();
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    for (const tag of BASELINE_SQL_TAGS) {
      const content = readMigrationSql(tag);
      await applyMigrationSql(sql, tag, splitMigrationStatements(content));
    }

    await ensureMigrationsTable(sql);
    const existingHashes = await loadExistingHashes(sql);
    const journalEntries = loadJournalEntries();
    const rowsToInsert = buildBaselineRows(journalEntries, existingHashes);
    await insertBaselineRows(sql, rowsToInsert);
    await verifyBaseline(sql);

    console.info("✓ Baseline complete — safe to switch this environment to bun run db:migrate");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function logStep(message: string): void {
  console.info(dryRun ? `○ [dry-run] ${message}` : `→ ${message}`);
}

async function applyMigrationSql(
  sql: postgres.Sql,
  tag: string,
  statements: string[]
): Promise<void> {
  logStep(`Apply migration SQL: ${tag} (${statements.length} statement(s))`);
  for (const stmt of statements) {
    await sql.unsafe(stmt);
  }
}

async function ensureMigrationsTable(sql: postgres.Sql): Promise<void> {
  logStep("Ensure drizzle.__drizzle_migrations exists");
  if (dryRun) return;
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;
}

async function loadExistingHashes(sql: postgres.Sql): Promise<Set<string>> {
  if (dryRun) return new Set();
  const rows = await sql<{ hash: string }[]>`
    SELECT hash FROM drizzle.__drizzle_migrations
  `;
  return new Set(rows.map((r) => r.hash));
}

async function insertBaselineRows(
  sql: postgres.Sql,
  rows: ReturnType<typeof buildBaselineRows>
): Promise<void> {
  if (rows.length === 0) {
    console.info("○ Journal already baselined — no new migration rows to insert");
    return;
  }
  logStep(`Insert ${rows.length} missing journal row(s) into drizzle.__drizzle_migrations`);
  if (dryRun) {
    for (const row of rows) {
      console.info(`  - ${row.tag} (created_at=${row.createdAt})`);
    }
    return;
  }
  for (const row of rows) {
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${row.hash}, ${row.createdAt})
    `;
  }
}

async function verifyBaseline(sql: postgres.Sql): Promise<void> {
  logStep("Verify RLS policies on org-scoped tables");
  if (dryRun) {
    console.info("○ [dry-run] Skipping live verification queries");
    return;
  }

  const policyRows = await sql<{ tablename: string; policy_count: string }[]>`
    SELECT tablename, count(*)::text AS policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(${sql.array([...RLS_ORG_TABLES])})
    GROUP BY tablename
    ORDER BY tablename
  `;

  const covered = new Set(policyRows.map((r) => r.tablename));
  const missing = RLS_ORG_TABLES.filter((table) => !covered.has(table));
  if (missing.length > 0) {
    console.error(`✗ Missing RLS policies on: ${missing.join(", ")}`);
    console.error("  Run SELECT * FROM pg_policies WHERE schemaname = 'public' to inspect.");
    process.exit(1);
  }

  console.info(`✓ RLS policies present on ${policyRows.length} org-scoped table(s)`);

  logStep("Verify audit_logs immutability triggers");
  const triggerRows = await sql<{ tgname: string }[]>`
    SELECT tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'audit_logs'
      AND NOT t.tgisinternal
      AND tgname = ANY(${sql.array([...AUDIT_IMMUTABILITY_TRIGGERS])})
  `;

  const triggerNames = new Set(triggerRows.map((r) => r.tgname));
  const missingTriggers = AUDIT_IMMUTABILITY_TRIGGERS.filter((name) => !triggerNames.has(name));
  if (missingTriggers.length > 0) {
    console.error(`✗ Missing audit_logs triggers: ${missingTriggers.join(", ")}`);
    process.exit(1);
  }

  console.info(`✓ audit_logs immutability triggers present (${triggerRows.length})`);

  const journalCount = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations
  `;
  console.info(`✓ drizzle.__drizzle_migrations row count: ${journalCount[0]?.count ?? "0"}`);
}

try {
  await main();
} catch (err) {
  console.error("✗ Baseline failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
