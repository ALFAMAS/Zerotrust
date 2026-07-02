/**
 * CI gate: flags destructive DDL in migration files.
 *
 * Destructive operations (DROP TABLE, ALTER TABLE ... DROP COLUMN, etc.)
 * are only allowed when explicitly listed in `.destructive-migrations.json`.
 * New destructive migrations added without an allowlist entry fail the gate.
 *
 * Usage:
 *   bun run scripts/check-destructive-migrations.ts
 *
 * Exit code: 0 if clean, 1 if unapproved destructive DDL is found.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MIGRATIONS_DIR = path.resolve(ROOT, "drizzle");
const ALLOWLIST_PATH = path.resolve(ROOT, ".destructive-migrations.json");

interface AllowlistEntry {
  file: string;
  pattern: string;
  reason: string;
}

interface AllowlistFile {
  approved: AllowlistEntry[];
}

// ── Destructive DDL detection ────────────────────────────────────────────────

/**
 * Matches destructive SQL patterns. We normalize the statement (lowercase,
 * collapse whitespace) before matching so formatting differences don't cause
 * false negatives.
 *
 * Patterns flagged:
 *  - DROP TABLE (with optional CASCADE / IF EXISTS)
 *  - DROP COLUMN
 *  - DROP INDEX
 *  - DROP CONSTRAINT
 *  - TRUNCATE
 *  - ALTER TABLE ... DROP
 */
const DESTRUCTIVE_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /drop\s+table\b/i, label: "DROP TABLE" },
  { regex: /drop\s+column\b/i, label: "DROP COLUMN" },
  { regex: /drop\s+index\b/i, label: "DROP INDEX" },
  { regex: /drop\s+constraint\b/i, label: "DROP CONSTRAINT" },
  { regex: /\btruncate\b/i, label: "TRUNCATE" },
  { regex: /alter\s+table\s+.*\bdrop\b/i, label: "ALTER TABLE ... DROP" },
];

interface DestructiveHit {
  file: string;
  line: number;
  text: string;
  pattern: string;
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function findDestructiveDDL(filePath: string, content: string): DestructiveHit[] {
  const hits: DestructiveHit[] = [];
  const lines = content.split("\n");

  // SQL statements in drizzle migrations are separated by `--> statement-breakpoint`.
  // We scan line-by-line because drizzle migrations put each statement on one line.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const normed = normalize(line);
    for (const { regex, label } of DESTRUCTIVE_PATTERNS) {
      if (regex.test(normed)) {
        hits.push({
          file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
          line: i + 1,
          text: line.trim(),
          pattern: label,
        });
        break; // one hit per line is enough
      }
    }
  }
  return hits;
}

// ── Allowlist ────────────────────────────────────────────────────────────────

function loadAllowlist(): AllowlistFile {
  if (!existsSync(ALLOWLIST_PATH)) {
    return { approved: [] };
  }
  try {
    return JSON.parse(readFileSync(ALLOWLIST_PATH, "utf-8")) as AllowlistFile;
  } catch {
    console.error(`❌ Could not parse ${path.relative(ROOT, ALLOWLIST_PATH)}`);
    process.exit(2);
  }
}

/**
 * A destructive hit is approved if the allowlist contains an entry with the
 * same file AND the same pattern label (or a matching pattern substring).
 */
function isApproved(hit: DestructiveHit, allowlist: AllowlistFile): boolean {
  return allowlist.approved.some(
    (entry) => entry.file === hit.file && (entry.pattern === hit.pattern || entry.pattern === "*")
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

function listMigrationFiles(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => path.resolve(MIGRATIONS_DIR, f))
    .sort()
    .map((p) => p.replace(/\\/g, "/"));
}

const allowlist = loadAllowlist();
const migrationFiles = listMigrationFiles();

if (migrationFiles.length === 0) {
  console.log("No migration files found — skipping destructive DDL check.");
  process.exit(0);
}

let totalHits = 0;
const unapproved: DestructiveHit[] = [];

for (const file of migrationFiles) {
  const content = readFileSync(file, "utf-8");
  const hits = findDestructiveDDL(file, content);
  totalHits += hits.length;
  for (const hit of hits) {
    if (!isApproved(hit, allowlist)) {
      unapproved.push(hit);
    }
  }
}

if (unapproved.length === 0) {
  console.log(
    `✅ ${totalHits} destructive statement(s) found across ${migrationFiles.length} migration(s); all approved.`
  );
  process.exit(0);
}

console.error(`❌ ${unapproved.length} unapproved destructive DDL statement(s) found:\n`);
for (const hit of unapproved) {
  console.error(`  ${hit.file}:${hit.line}  [${hit.pattern}]`);
  console.error(`    ${hit.text}\n`);
}
console.error(
  "These destructive operations are not in the allowlist.\n" +
    "To approve them (e.g. for a planned expand/contract migration),\n" +
    `add entries to ${path.relative(ROOT, ALLOWLIST_PATH)} with a reason.\n\n` +
    "Example entry:\n" +
    JSON.stringify(
      {
        approved: [
          {
            file: unapproved[0].file,
            pattern: unapproved[0].pattern,
            reason: "Expand/contract: legacy table removed after zero-downtime migration",
          },
        ],
      },
      null,
      2
    ) +
    "\n"
);
process.exit(1);
