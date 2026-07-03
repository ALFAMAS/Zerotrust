/**
 * Shared S3-compatible storage configuration (env-driven).
 *
 * Used by compliance anchoring (`src/audit/anchor.ts`) and ops object storage
 * (`src/services/ops/objectStorage.service.ts`) without crossing module boundaries.
 */

export interface S3Config {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
}

function readConfig(): S3Config | null {
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
  const bucket = process.env.BACKUP_S3_BUCKET;
  if (!accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }
  return {
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    region: process.env.BACKUP_S3_REGION ?? "us-east-1",
    accessKeyId,
    secretAccessKey,
    bucket,
    prefix: process.env.BACKUP_S3_PREFIX ?? "backups/",
    forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE === "true",
  };
}

/** Returns the current S3 config, or null if S3 backup isn't configured. */
export function getS3Config(): S3Config | null {
  return readConfig();
}

/** Returns true if S3 backup is configured (env vars present). */
export function isS3BackupEnabled(): boolean {
  return readConfig() !== null;
}

/** S3-side retention window in days. Falls back to BACKUP_RETENTION_DAYS or 30. */
export function s3RetentionDays(): number {
  const explicit = process.env.BACKUP_S3_RETENTION_DAYS;
  if (explicit) return parseInt(explicit, 10);
  const fallback = process.env.BACKUP_RETENTION_DAYS;
  if (fallback) return parseInt(fallback, 10);
  return 30;
}
