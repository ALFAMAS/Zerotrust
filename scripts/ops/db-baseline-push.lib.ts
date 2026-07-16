/**
 * Shared helpers for db-baseline-push operator script (MIG-3).
 * Exported for unit tests — not a public API surface.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const MIGRATIONS_DIR = path.resolve(ROOT, "drizzle");
export const JOURNAL_PATH = path.resolve(ROOT, "drizzle/meta/_journal.json");

/** SQL migrations applied to db:push databases before baselining the journal. */
export const BASELINE_SQL_TAGS = [
  "0031_audit_logs_immutable",
  "0035_org_rls_policies",
  "0036_usage_counters_rls",
  "0038_org_rls_expansion",
  "0043_tier5_rls_expansion",
] as const;

/** Tables that must have at least one RLS policy after baseline SQL runs. */
export const RLS_ORG_TABLES = [
  "webhook_endpoints",
  "support_tickets",
  "subscriptions",
  "usage_counters",
  "organization_members",
  "organization_invites",
  "org_security_policies",
  "org_custom_roles",
  "trusted_devices",
  "tax_exemptions",
  "api_keys",
  "file_attachments",
  "feedback",
  "cross_tenant_jit_requests",
  "org_feature_flags",
  "org_scim_tokens",
] as const;

export const AUDIT_IMMUTABILITY_TRIGGERS = [
  "audit_logs_no_update",
  "audit_logs_no_delete",
] as const;

export interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export interface JournalFile {
  entries: JournalEntry[];
}

export interface BaselineMigrationRow {
  tag: string;
  hash: string;
  createdAt: number;
}

export function loadJournalEntries(journalPath = JOURNAL_PATH): JournalEntry[] {
  const parsed = JSON.parse(readFileSync(journalPath, "utf-8")) as JournalFile;
  return parsed.entries;
}

export function migrationSqlPath(tag: string, migrationsDir = MIGRATIONS_DIR): string {
  return path.join(migrationsDir, `${tag}.sql`);
}

export function readMigrationSql(tag: string, migrationsDir = MIGRATIONS_DIR): string {
  return readFileSync(migrationSqlPath(tag, migrationsDir), "utf-8");
}

/** Matches drizzle-orm readMigrationFiles() hashing. */
export function computeMigrationHash(sqlContent: string): string {
  return createHash("sha256").update(sqlContent).digest("hex");
}

export function splitMigrationStatements(sqlContent: string): string[] {
  return sqlContent
    .split("--> statement-breakpoint")
    .map((stmt) => stmt.trim())
    .filter(Boolean);
}

export function buildBaselineRows(
  entries: JournalEntry[],
  existingHashes: Set<string>,
  migrationsDir = MIGRATIONS_DIR
): BaselineMigrationRow[] {
  const rows: BaselineMigrationRow[] = [];
  for (const entry of entries) {
    const sql = readMigrationSql(entry.tag, migrationsDir);
    const hash = computeMigrationHash(sql);
    if (existingHashes.has(hash)) continue;
    rows.push({ tag: entry.tag, hash, createdAt: entry.when });
  }
  return rows;
}
