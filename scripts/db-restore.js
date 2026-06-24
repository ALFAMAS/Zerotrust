#!/usr/bin/env node
// One-shot database restore from a pg_dump custom-format backup.
// Usage: bun run db:restore -- ./backups/zerotrust-<stamp>.dump [--clean]
//   (or: node scripts/db-restore.js ./backups/<file>.dump)
// Env:  DATABASE_URL (required, target DB)
//
// SAFETY: this writes into the target DATABASE_URL. Restoring a full dump over a
// live database is destructive — point DATABASE_URL at the intended target and
// pass --clean only when you mean to drop existing objects first.

const { spawn } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("✗ DATABASE_URL is not set (copy .env.example to .env)");
  process.exit(1);
}

const args = process.argv.slice(2);
const clean = args.includes("--clean");
const fileArg = args.find((a) => !a.startsWith("--"));
if (!fileArg) {
  console.error("✗ Usage: bun run db:restore -- <path-to-.dump> [--clean]");
  process.exit(1);
}
const file = path.resolve(fileArg);
if (!existsSync(file)) {
  console.error(`✗ Backup file not found: ${file}`);
  process.exit(1);
}

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      stdio: ["ignore", "inherit", "inherit"],
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

(async () => {
  console.log(`→ Restoring ${file} into the target database`);
  if (clean) console.log("  (--clean: dropping existing objects first)");
  const restoreArgs = [
    "--no-owner",
    "--no-privileges",
    ...(clean ? ["--clean", "--if-exists"] : []),
    `--dbname=${databaseUrl}`,
    file,
  ];
  await run("pg_restore", restoreArgs);
  console.log("✓ Restore complete");
})().catch((err) => {
  console.error(`✗ Restore failed: ${err.message}`);
  console.error("  pg_restore must be installed and on PATH (it ships with PostgreSQL).");
  console.error("  Non-fatal relation/role warnings are expected with --no-owner restores.");
  process.exit(1);
});
