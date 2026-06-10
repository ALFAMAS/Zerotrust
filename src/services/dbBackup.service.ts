/**
 * PostgreSQL backup service.
 * Runs pg_dump (custom format, compressed) into BACKUP_DIR, prunes dumps
 * older than BACKUP_RETENTION_DAYS (default 30), and optionally uploads to
 * S3 when the aws CLI is available and BACKUP_S3_BUCKET is set.
 *
 *   bun run db:backup            — one-shot backup (scripts/db-backup.js)
 *   BACKUP_ENABLED=true          — daily scheduler inside the API server
 *   BACKUP_DIR=./backups         — destination directory
 *   BACKUP_RETENTION_DAYS=30     — local retention window
 *   BACKUP_S3_BUCKET=my-bucket   — optional S3 upload (uses `aws s3 cp`)
 */

import { spawn } from "child_process";
import { mkdir, readdir, stat, unlink } from "fs/promises";
import * as path from "path";
import { getLogger } from "../logger";

const logger = getLogger("db-backup");

export interface BackupResult {
  ok: boolean;
  file?: string;
  uploaded?: boolean;
  pruned: string[];
  error?: string;
}

function backupDir(): string {
  return path.resolve(process.env.BACKUP_DIR ?? "./backups");
}

function retentionDays(): number {
  return parseInt(process.env.BACKUP_RETENTION_DAYS ?? "30");
}

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "ignore", "pipe"],
      // shell:true keeps Windows compatibility for .cmd/.exe resolution
      shell: process.platform === "win32",
    });
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(0) : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(0, 500)}`))
    );
  });
}

/** Delete local dumps older than the retention window. Returns pruned names. */
export async function pruneOldBackups(): Promise<string[]> {
  const dir = backupDir();
  const cutoff = Date.now() - retentionDays() * 86400_000;
  const pruned: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return pruned; // directory doesn't exist yet
  }
  for (const name of entries) {
    if (!name.startsWith("zeroauth-") || !name.endsWith(".dump")) continue;
    const full = path.join(dir, name);
    try {
      const info = await stat(full);
      if (info.mtimeMs < cutoff) {
        await unlink(full);
        pruned.push(name);
      }
    } catch {
      // file vanished — ignore
    }
  }
  return pruned;
}

/** Run a full backup: pg_dump → prune → optional S3 upload. */
export async function runBackup(): Promise<BackupResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { ok: false, pruned: [], error: "DATABASE_URL not set" };
  }

  const dir = backupDir();
  await mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(dir, `zeroauth-${stamp}.dump`);

  try {
    // Custom format (-Fc) is compressed and restorable with pg_restore
    await run("pg_dump", ["--format=custom", `--file=${file}`, databaseUrl]);
    logger.info("Database backup written", { file });
  } catch (err) {
    logger.error("pg_dump failed", err as Error);
    return { ok: false, pruned: [], error: String(err) };
  }

  const pruned = await pruneOldBackups();
  if (pruned.length) logger.info("Pruned old backups", { count: pruned.length });

  let uploaded = false;
  const bucket = process.env.BACKUP_S3_BUCKET;
  if (bucket) {
    try {
      const key = `backups/${path.basename(file)}`;
      await run("aws", ["s3", "cp", file, `s3://${bucket}/${key}`]);
      uploaded = true;
      logger.info("Backup uploaded to S3", { bucket, key });
    } catch (err) {
      logger.error("S3 upload failed (backup kept locally)", err as Error);
    }
  }

  return { ok: true, file, uploaded, pruned };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let backupInterval: ReturnType<typeof setInterval> | null = null;

export function startBackupScheduler(intervalHours = 24): void {
  if (process.env.BACKUP_ENABLED !== "true") {
    logger.info("DB backup scheduler disabled (set BACKUP_ENABLED=true to enable)");
    return;
  }
  if (backupInterval) clearInterval(backupInterval);
  backupInterval = setInterval(
    () => {
      void runBackup();
    },
    intervalHours * 60 * 60 * 1000
  );
  if (backupInterval.unref) backupInterval.unref();
  logger.info("DB backup scheduler started", { intervalHours });
}

export function stopBackupScheduler(): void {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}
