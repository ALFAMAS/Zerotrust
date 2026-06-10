#!/usr/bin/env node
// One-shot database backup: pg_dump → ./backups with retention pruning.
// Usage: bun run db:backup   (or: node scripts/db-backup.js)
// Env:   DATABASE_URL (required), BACKUP_DIR, BACKUP_RETENTION_DAYS, BACKUP_S3_BUCKET

const { spawn } = require("child_process");
const { mkdirSync, readdirSync, statSync, unlinkSync, existsSync } = require("fs");
const path = require("path");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("✗ DATABASE_URL is not set (copy .env.example to .env)");
  process.exit(1);
}

const dir = path.resolve(process.env.BACKUP_DIR || "./backups");
const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || "30");
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = path.join(dir, `zeroauth-${stamp}.dump`);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "inherit", "inherit"],
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

(async () => {
  console.log(`→ Backing up database to ${file}`);
  await run("pg_dump", ["--format=custom", `--file=${file}`, databaseUrl]);
  console.log("✓ Backup complete");

  // Prune dumps older than the retention window
  const cutoff = Date.now() - retentionDays * 86400000;
  let pruned = 0;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith("zeroauth-") || !name.endsWith(".dump")) continue;
    const full = path.join(dir, name);
    if (statSync(full).mtimeMs < cutoff) {
      unlinkSync(full);
      pruned++;
    }
  }
  if (pruned) console.log(`✓ Pruned ${pruned} backup(s) older than ${retentionDays} days`);

  // Optional S3 upload via aws CLI
  const bucket = process.env.BACKUP_S3_BUCKET;
  if (bucket) {
    const key = `backups/${path.basename(file)}`;
    console.log(`→ Uploading to s3://${bucket}/${key}`);
    await run("aws", ["s3", "cp", file, `s3://${bucket}/${key}`]);
    console.log("✓ Uploaded to S3");
  }

  console.log(existsSync(file) ? `✓ Done: ${file}` : "✗ Backup file missing");
})().catch((err) => {
  console.error(`✗ Backup failed: ${err.message}`);
  console.error("  pg_dump must be installed and on PATH (it ships with PostgreSQL).");
  process.exit(1);
});
