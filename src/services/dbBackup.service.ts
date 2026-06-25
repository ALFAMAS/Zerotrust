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
 *   BACKUP_ENCRYPTION_KEY          — enables AES-256-GCM encryption at rest
 *   BACKUP_REQUIRE_ENCRYPTION=true — fail backups when encryption is not configured
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
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
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
  encrypted?: boolean;
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

function encryptionKey(): Buffer | null {
  const hex = process.env.BACKUP_ENCRYPTION_KEY_HEX;
  if (hex) {
    const key = Buffer.from(hex, "hex");
    if (key.length !== 32) {
      throw new Error("BACKUP_ENCRYPTION_KEY_HEX must decode to 32 bytes");
    }
    return key;
  }

  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) return null;

  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32 && base64.toString("base64") === raw) return base64;

  return scryptSync(raw, "zerotrust-db-backup", 32);
}

function backupEncryptionKey(): Buffer | null {
  const key = encryptionKey();
  if (!key && process.env.BACKUP_REQUIRE_ENCRYPTION === "true") {
    throw new Error("BACKUP_REQUIRE_ENCRYPTION=true but BACKUP_ENCRYPTION_KEY is not set");
  }

  return key;
}

async function encryptBackup(file: string, key: Buffer | null): Promise<string | null> {
  if (!key) {
    logger.warn(
      "Database backup encryption disabled; set BACKUP_ENCRYPTION_KEY to encrypt backups at rest"
    );
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encryptedFile = `${file}.enc`;

  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(file);
    const output = createWriteStream(encryptedFile);
    input.on("error", reject);
    cipher.on("error", reject);
    output.on("error", reject);
    output.on("finish", resolve);
    input.pipe(cipher).pipe(output);
  });

  const tag = cipher.getAuthTag();
  await writeFile(
    `${encryptedFile}.meta`,
    `${JSON.stringify({
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
    })}\n`,
    { flag: "wx" }
  );
  await unlink(file);
  logger.info("Database backup encrypted", { file: encryptedFile });
  return encryptedFile;
}

function isBackupArtifact(name: string): boolean {
  return (
    name.startsWith("zerotrust-") &&
    (name.endsWith(".dump") || name.endsWith(".dump.enc") || name.endsWith(".dump.enc.meta"))
  );
}

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "ignore", "pipe"],
      // SECURITY (CWE-78): never use shell:true — args are passed as a literal
      // argv array so shell metacharacters in DATABASE_URL or file paths cannot
      // be interpreted. pg_dump / pg_restore resolve on PATH without a shell.
      shell: false,
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
    if (!isBackupArtifact(name)) continue;
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

  let key: Buffer | null;
  try {
    key = backupEncryptionKey();
  } catch (err) {
    logger.error("Database backup encryption is misconfigured", err as Error);
    return { ok: false, pruned: [], error: String(err) };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  let file = path.join(dir, `zerotrust-${stamp}.dump`);

  try {
    // Custom format (-Fc) is compressed and restorable with pg_restore
    await run("pg_dump", ["--format=custom", `--file=${file}`, databaseUrl]);
    logger.info("Database backup written", { file });
    const encryptedFile = await encryptBackup(file, key);
    if (encryptedFile) file = encryptedFile;
  } catch (err) {
    logger.error("pg_dump failed", err as Error);
    try {
      await unlink(file);
    } catch {
      // Backup file was never created or was already removed.
    }
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
      if (file.endsWith(".enc")) {
        await uploadFile(`${file}.meta`, `${key}.meta`);
      }
      uploaded = true;
      s3Pruned = await pruneOldS3Backups(s3RetentionDays());
      if (s3Pruned.length) {
        logger.info("S3 retention sweep complete", { count: s3Pruned.length });
      }
    } catch (err) {
      logger.error("S3 upload/prune failed (backup kept locally)", err as Error);
    }
  }

  return { ok: true, file, uploaded, encrypted: file.endsWith(".enc"), pruned, s3Pruned };
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
