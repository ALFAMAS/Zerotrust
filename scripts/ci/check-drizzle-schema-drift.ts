/**
 * CI gate: fail when committed schema/journal would produce new migrations (MIG-4).
 *
 * Copies `drizzle/` to a temp directory, runs `drizzle-kit generate` there (never
 * mutates the worktree), and fails when the generated tree diverges from committed.
 *
 * On Linux/macOS CI uses `script(1)` so drizzle-kit can resolve snapshot prompts
 * headlessly. On Windows, run from an interactive terminal (TTY) or rely on CI.
 *
 * Usage:
 *   bun run migrations:schema:check
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const COMMITTED_DRIZZLE = path.resolve(ROOT, "drizzle");
const SCHEMA_PATH = path.resolve(ROOT, "src/db/schema/index.ts");

function hashFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function collectRelativeFiles(dir: string, base = dir): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      for (const [k, v] of collectRelativeFiles(full, base)) out.set(k, v);
    } else if (entry.isFile()) {
      out.set(rel, hashFile(full));
    }
  }
  return out;
}

function diffTrees(before: Map<string, string>, after: Map<string, string>): string[] {
  const lines: string[] = [];
  const keys = new Set([...before.keys(), ...after.keys()]);
  for (const key of [...keys].sort()) {
    const a = before.get(key);
    const b = after.get(key);
    if (a === b) continue;
    if (a === undefined) lines.push(`+ ${key}`);
    else if (b === undefined) lines.push(`- ${key}`);
    else lines.push(`~ ${key}`);
  }
  return lines;
}

function runGenerate(configFile: string, cwd: string): { ok: boolean; detail: string } {
  const generateCmd = `bunx drizzle-kit generate --config ${configFile}`;
  const usePseudoTty = process.platform !== "win32";

  const result = usePseudoTty
    ? spawnSync("script", ["-qefc", generateCmd, "/dev/null"], {
        cwd,
        encoding: "utf-8",
        env: process.env,
      })
    : spawnSync("bunx", ["drizzle-kit", "generate", "--config", configFile], {
        cwd,
        encoding: "utf-8",
        env: process.env,
      });

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (result.error) {
    return { ok: false, detail: result.error.message };
  }
  if (result.status !== 0) {
    return { ok: false, detail: output || `drizzle-kit generate exited ${result.status}` };
  }
  if (/Interactive prompts require a TTY terminal/i.test(output)) {
    return {
      ok: false,
      detail: `${output}\n\nHint: on Windows run from an interactive terminal, or rely on CI (ubuntu + script).`,
    };
  }
  if (/^\s*Error:/m.test(output)) {
    return { ok: false, detail: output };
  }
  return { ok: true, detail: output };
}

mkdirSync(path.join(ROOT, ".tmp"), { recursive: true });
const tempRoot = mkdtempSync(path.join(ROOT, ".tmp", "drizzle-schema-check-"));
const tempDrizzle = path.join(tempRoot, "drizzle");
const tempConfig = path.join(tempRoot, "drizzle-check.config.ts");
const schemaRel = path.relative(tempRoot, SCHEMA_PATH).replace(/\\/g, "/");

let exitCode = 0;

try {
  cpSync(COMMITTED_DRIZZLE, tempDrizzle, { recursive: true });
  const before = collectRelativeFiles(tempDrizzle);

  const configContents = `import type { Config } from "drizzle-kit";

export default {
  schema: ${JSON.stringify(schemaRel)},
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: "postgresql://localhost:5432/drizzle_schema_check" },
} satisfies Config;
`;
  writeFileSync(tempConfig, configContents, "utf-8");

  const generated = runGenerate(path.basename(tempConfig), tempRoot);
  if (!generated.ok) {
    console.error("❌ Failed to run drizzle-kit generate for schema drift check.\n");
    console.error(generated.detail);
    exitCode = 1;
  } else {
    const after = collectRelativeFiles(tempDrizzle);
    const changes = diffTrees(before, after);
    if (changes.length > 0) {
      console.error("❌ Schema ↔ migrations drift detected.\n");
      for (const line of changes) console.error(`  ${line}`);
      console.error(
        "\nFix: run `bun run db:generate` locally, commit the new `drizzle/*.sql` + journal updates, and push."
      );
      exitCode = 1;
    } else {
      console.info("✅ Drizzle schema matches committed migrations (no generate diff).");
    }
  }
} catch (err) {
  console.error("❌ Schema drift check failed.");
  console.error(err instanceof Error ? err.message : String(err));
  exitCode = 1;
} finally {
  try {
    rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup.
  }
}

process.exit(exitCode);
