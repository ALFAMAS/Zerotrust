/**
 * MT-1 — org-scoping lint for org-scoped Drizzle tables in route/store code.
 *
 * Scans route and webhook modules for references to org-scoped tables and
 * requires an org-isolation predicate nearby (eq(orgId), orgScope helpers, etc.).
 *
 *   bun run scripts/check-org-scoping.ts
 *
 * Exit code: 0 if clean, 1 if violations found.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, relative, resolve } from "node:path";

interface OrgScopeConfig {
  orgScopedTables: string[];
  scanDirs: string[];
  allowlist: Record<string, string>;
  orgPredicatePatterns: string[];
}

const ROOT = resolve(import.meta.dirname, "..");
const config: OrgScopeConfig = JSON.parse(
  readFileSync(resolve(ROOT, "scripts/org-scoped-tables.json"), "utf-8")
);

interface Violation {
  file: string;
  table: string;
  line: number;
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, files);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

function hasOrgPredicate(snippet: string): boolean {
  return config.orgPredicatePatterns.some((pattern) => new RegExp(pattern).test(snippet));
}

function checkFile(filePath: string): Violation[] {
  const rel = relative(ROOT, filePath).replace(/\\/g, "/");
  if (config.allowlist[rel]) return [];

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const violations: Violation[] = [];

  for (const table of config.orgScopedTables) {
    const pattern = new RegExp(`\\b${table}\\b`);
    for (let i = 0; i < lines.length; i++) {
      if (!pattern.test(lines[i]!)) continue;
      const start = Math.max(0, i - 12);
      const end = Math.min(lines.length, i + 18);
      const window = lines.slice(start, end).join("\n");
      if (!hasOrgPredicate(window)) {
        violations.push({ file: rel, table, line: i + 1 });
      }
    }
  }

  return violations;
}

const files = config.scanDirs.flatMap((dir) => walk(resolve(ROOT, dir)));
const violations = files.flatMap(checkFile);

if (violations.length === 0) {
  console.log(`✅ org-scoping lint passed (${files.length} files scanned)`);
  process.exit(0);
}

console.error(`❌ org-scoping lint found ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line} — ${v.table} referenced without org predicate nearby`);
}
process.exit(1);
