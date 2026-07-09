/**
 * CI gate: ensure `drizzle/meta/_journal.json` matches migration files on disk.
 *
 * Why: drizzle-kit `migrate` is journal-driven; if migrations aren't journaled,
 * staging/production deploy paths silently skip schema changes.
 *
 * This script:
 * - Lists all `drizzle/*.sql` migrations by basename (without `.sql`)
 * - Loads `drizzle/meta/_journal.json` tags
 * - Fails if sets differ or order differs
 *
 * Usage:
 *   bun run scripts/check-drizzle-journal.ts
 */

import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MIGRATIONS_DIR = path.resolve(ROOT, "drizzle");
const JOURNAL_PATH = path.resolve(ROOT, "drizzle/meta/_journal.json");

interface JournalEntry {
  tag: string;
}

interface JournalFile {
  entries: JournalEntry[];
}

function listMigrationTags(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""))
    .sort();
}

function loadJournalTags(): string[] {
  const parsed = JSON.parse(readFileSync(JOURNAL_PATH, "utf-8")) as JournalFile;
  return parsed.entries.map((e) => e.tag);
}

function toSet(xs: string[]): Set<string> {
  return new Set(xs);
}

function setDiff(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const x of a) if (!b.has(x)) out.push(x);
  return out.sort();
}

const fileTags = listMigrationTags();
const journalTags = loadJournalTags();

const fileSet = toSet(fileTags);
const journalSet = toSet(journalTags);

const missingInJournal = setDiff(fileSet, journalSet);
const extraInJournal = setDiff(journalSet, fileSet);

const orderMismatch =
  fileTags.length === journalTags.length && fileTags.some((tag, idx) => journalTags[idx] !== tag);

if (missingInJournal.length === 0 && extraInJournal.length === 0 && !orderMismatch) {
  console.info(`✅ Drizzle journal matches ${fileTags.length} migration file(s).`);
  process.exit(0);
}

console.error("❌ Drizzle journal drift detected.\n");

if (missingInJournal.length > 0) {
  console.error("Missing from journal:");
  for (const tag of missingInJournal) console.error(`  - ${tag}`);
  console.error("");
}

if (extraInJournal.length > 0) {
  console.error("Extra in journal (no matching file):");
  for (const tag of extraInJournal) console.error(`  - ${tag}`);
  console.error("");
}

if (orderMismatch) {
  console.error("Order mismatch: journal tags are not in lexicographic filename order.");
  console.error("Expected order (from files):");
  for (const tag of fileTags) console.error(`  - ${tag}`);
  console.error("");
  console.error("Actual order (from journal):");
  for (const tag of journalTags) console.error(`  - ${tag}`);
  console.error("");
}

console.error(
  "Fix: regenerate/repair `drizzle/meta/_journal.json` so it includes every `drizzle/*.sql` tag in order."
);
process.exit(1);
