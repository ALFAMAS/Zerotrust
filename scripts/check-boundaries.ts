/**
 * Module boundary enforcement.
 *
 * Reads `.boundaries.json` for domain definitions and import rules, scans
 * all source files, and reports violations. Run via:
 *
 *   bun run scripts/check-boundaries.ts
 *
 * Exit code: 0 if clean, 1 if violations found.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";

// ── types ────────────────────────────────────────────────────────────────

interface BoundaryConfig {
  version: number;
  domains: Record<
    string,
    {
      paths: string[];
      can_import: string[];
    }
  >;
}

interface Violation {
  file: string;
  import_path: string;
  from_domain: string;
  to_domain: string;
  line: number;
}

// ── load config ──────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, "..");
const configPath = resolve(ROOT, ".boundaries.json");
let config: BoundaryConfig;
try {
  config = JSON.parse(readFileSync(configPath, "utf-8"));
} catch {
  console.error("❌ Could not read .boundaries.json");
  process.exit(2);
}

// ── build domain lookup ──────────────────────────────────────────────────

const fileToDomain = new Map<string, string>();
for (const [domain, def] of Object.entries(config.domains)) {
  for (const p of def.paths) {
    fileToDomain.set(p.replace(/\/$/, ""), domain);
  }
}

function getDomain(filePath: string): string | null {
  // Normalize to forward slashes, relative to root
  const rel = relative(ROOT, filePath).replace(/\\/g, "/");
  // Check each known domain path
  for (const [prefix, domain] of fileToDomain) {
    if (rel.startsWith(prefix.replace(/\\/g, "/"))) {
      return domain;
    }
  }
  return null;
}

// ── find all TypeScript source files ─────────────────────────────────────

function walk(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (
      entry.isDirectory() &&
      entry.name !== "node_modules" &&
      entry.name !== "dist" &&
      entry.name !== ".git" &&
      entry.name !== "build" &&
      entry.name !== "coverage" &&
      entry.name !== ".next" &&
      entry.name !== "drizzle"
    ) {
      walk(full, files);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.includes(".test.") &&
      !entry.name.includes(".spec.")
    ) {
      files.push(full);
    }
  }
  return files;
}

const srcDir = resolve(ROOT, "src");
const sourceFiles = walk(srcDir);

// ── parse imports ────────────────────────────────────────────────────────

function parseImports(filePath: string): Array<{ path: string; line: number }> {
  const content = readFileSync(filePath, "utf-8");
  const imports: Array<{ path: string; line: number }> = [];
  const lines = content.split("\n");

  const importRegex = /^\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(importRegex);
    if (match) {
      imports.push({ path: match[1], line: i + 1 });
    }
  }
  return imports;
}

// ── check ────────────────────────────────────────────────────────────────

function resolveImport(fromFile: string, importPath: string): string | null {
  // Only track internal (relative) imports
  if (importPath.startsWith(".")) {
    const dir = dirname(fromFile);
    const resolved = resolve(dir, importPath);
    // Try .ts, .tsx, /index.ts, /index.tsx
    const candidates = [
      resolved + ".ts",
      resolved + ".tsx",
      resolved + "/index.ts",
      resolved + "/index.tsx",
      resolved,
    ];
    for (const c of candidates) {
      try {
        statSync(c);
        return c;
      } catch {
        // doesn't exist, try next
      }
    }
  }
  return null;
}

const violations: Violation[] = [];

for (const file of sourceFiles) {
  const fromDomain = getDomain(file);
  if (!fromDomain) continue; // file not in any domain (e.g., api/server.ts, db/schema.ts)

  const imports = parseImports(file);
  for (const imp of imports) {
    const resolved = resolveImport(file, imp.path);
    if (!resolved) continue; // external package or couldn't resolve

    const toDomain = getDomain(resolved);
    if (!toDomain) continue; // target not in any domain

    // Same domain = always allowed
    if (fromDomain === toDomain) continue;

    // Check if from_domain can import to_domain
    const domainDef = config.domains[fromDomain];
    if (!domainDef) continue;

    if (!domainDef.can_import.includes(toDomain)) {
      violations.push({
        file: relative(ROOT, file),
        import_path: imp.path,
        from_domain: fromDomain,
        to_domain: toDomain,
        line: imp.line,
      });
    }
  }
}

// ── report ───────────────────────────────────────────────────────────────

if (violations.length === 0) {
  console.log("✅ No module boundary violations.");
  process.exit(0);
}

console.error(`❌ ${violations.length} module boundary violation(s):\n`);

// Group by rule
const byRule = new Map<string, Violation[]>();
for (const v of violations) {
  const key = `${v.from_domain} → ${v.to_domain}`;
  if (!byRule.has(key)) byRule.set(key, []);
  byRule.get(key)!.push(v);
}

for (const [rule, vs] of byRule) {
  console.error(`  ${rule} (${vs.length} violation(s)):`);
  for (const v of vs) {
    console.error(`    ${v.file}:${v.line}  imports "${v.import_path}"`);
  }
  console.error("");
}

console.error(
  "Fix: move the imported code to a shared location, add the target domain to the\n" +
    "      can_import list (if intentional), or refactor to use a different import path."
);

process.exit(1);
