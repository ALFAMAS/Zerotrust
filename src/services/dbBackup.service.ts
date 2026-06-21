/**
 * PostgreSQL backup service.
 * Runs pg_dump (custom format, compressed) into BACKUP_DIR, prunes dumps
 * older than BACKUP_RETENTION_DAYS (default 30), and optionally uploads to
 * any S3-compatible storage (AWS S3, Backblaze B2, Cloudflare R2, MinIO, ...).
 *
 *   bun run db:backup            — one-shot backup (scripts/db-backup.js)
 *   BACKUP_ENABLED=true          — daily scheduler inside the API server
 *   BACKUP_DIR=./backups         — destination directory
 *   BACKUP_RETENTION_DAYS=30     — local retention window
 *
 * S3-compatible upload configuration (see src/services/objectStorage.service.ts):
 *   BACKUP_S3_BUCKET             — required to enable uploads
 *   BACKUP_S3_ENDPOINT           — e.g. https://s3.eu-central-003.backblazeb2.com
 *   BACKUP_S3_REGION            — any value the provider accepts (e.g. eu-central-003)
 *   BACKUP_S3_ACCESS_KEY_ID
 *   BACKUP_S3_SECRET_ACCESS_KEY
 *   BACKUP_S3_PREFIX             — default "backups/"
 *   BACKUP_S3_FORCE_PATH_STYLE   — "true" for Backblaze/MinIO; false (default) for AWS
 *   BACKUP_S3_RETENTION_DAYS     — S3-side retention; falls back to BACKUP_RETENTION_DAYS
 */

import { spawn } from "node:child_process";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import * as path from "node:path";
import { getLogger } from "../logger";
import {
  isS3BackupEnabled,
  pruneOldBackups as pruneOldS3Backups,
  s3RetentionDays,
  uploadFile,
} from "./objectStorage.service";

const logger = getLogger("db-backup");

export interface BackupResult {
  ok: boolean;
  file?: string;
  uploaded?: boolean;
  pruned: string[];
  s3Pruned?: string[];
  error?: string;
}

function backupDir(): string {
  return path.resolve(process.env.BACKUP_DIR ?? "./backups");
}

function retentionDays(): number {
  return parseInt(process.env.BACKUP_RETENTION_DAYS ?? "30", 10);
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

/** Run a full backup: pg_dump → local prune → optional S3 upload + S3 prune. */
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
  if (pruned.length) logger.info("Pruned old local backups", { count: pruned.length });

  // Optional S3-compatible upload + S3-side retention.
  let uploaded = false;
  let s3Pruned: string[] | undefined;
  if (isS3BackupEnabled()) {
    try {
      const key = path.basename(file);
      await uploadFile(file, key);
      uploaded = true;
      s3Pruned = await pruneOldS3Backups(s3RetentionDays());
      if (s3Pruned.length) {
        logger.info("S3 retention sweep complete", { count: s3Pruned.length });
      }
    } catch (err) {
      logger.error("S3 upload/prune failed (backup kept locally)", err as Error);
    }
  }

  return { ok: true, file, uploaded, pruned, s3Pruned };
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
