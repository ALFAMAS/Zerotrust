/**
 * Provider-agnostic S3-compatible object storage client.
 *
 * Wraps AWS SDK v3 with provider-agnostic configuration so the same code path
 * works against AWS S3, Backblaze B2, Cloudflare R2, MinIO, Wasabi, etc. The
 * switching lever is environment configuration (endpoint, region, credentials,
 * forcePathStyle), not code changes.
 *
 *   BACKUP_S3_ENDPOINT                e.g. https://s3.eu-central-003.backblazeb2.com
 *   BACKUP_S3_REGION                 e.g. eu-central-003
 *   BACKUP_S3_ACCESS_KEY_ID          required
 *   BACKUP_S3_SECRET_ACCESS_KEY      required
 *   BACKUP_S3_BUCKET                 required to enable uploads
 *   BACKUP_S3_PREFIX                 default "backups/"
 *   BACKUP_S3_FORCE_PATH_STYLE       default false (true for Backblaze/MinIO)
 *   BACKUP_S3_RETENTION_DAYS         S3-side retention; falls back to BACKUP_RETENTION_DAYS
 *
 * Notes for provider quirks:
 *   - Backblaze B2 / MinIO require forcePathStyle=true (no subdomain bucket URLs)
 *     and a region string (any value works for B2, but the SDK requires it).
 *   - AWS S3 uses virtual-hosted style (bucket.s3.region.amazonaws.com); the SDK
 *     default is correct when BACKUP_S3_ENDPOINT is unset.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getLogger } from "../logger";

const logger = getLogger("object-storage");

export interface S3Config {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
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

let _client: S3Client | null = null;
let _clientConfigKey = "";

function getClient(cfg: S3Config): S3Client {
  // Recreate the client when config changes (cheap; SDK v3 is connection-pooled).
  const key = `${cfg.endpoint ?? ""}|${cfg.region}|${cfg.accessKeyId}|${cfg.forcePathStyle}`;
  if (!_client || _clientConfigKey !== key) {
    _client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
    _clientConfigKey = key;
  }
  return _client;
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

function fullKey(cfg: S3Config, key: string): string {
  const prefix = cfg.prefix.endsWith("/") ? cfg.prefix : `${cfg.prefix}/`;
  return `${prefix}${key.replace(/^\/+/, "")}`;
}

/** Lightweight health check — verifies credentials + bucket access. */
export async function pingS3(): Promise<{ ok: boolean; error?: string }> {
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: "S3 backup not configured" };
  try {
    await getClient(cfg).send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Same as `pingS3` but races against a hard timeout so a stuck network call
 * can't hang a caller (notably the public `/status` endpoint). The promise
 * rejects on timeout so the caller can map it to a "down" component status.
 */
export function pingS3WithTimeout(
  timeoutMs = 4000,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("S3 ping timed out")),
      timeoutMs,
    );
    pingS3()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** Stream a local file to the configured bucket under the configured prefix. */
export async function uploadFile(
  localPath: string,
  key: string,
): Promise<{ key: string; size: number }> {
  const cfg = readConfig();
  if (!cfg)
    throw new Error(
      "S3 backup not configured (BACKUP_S3_BUCKET + credentials)",
    );

  const info = await stat(localPath);
  const objectKey = fullKey(cfg, key);
  const body = createReadStream(localPath);

  await getClient(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: objectKey,
      Body: body,
      ContentLength: info.size,
      ContentType: "application/octet-stream",
    }),
  );

  logger.info("Uploaded to S3-compatible storage", {
    bucket: cfg.bucket,
    key: objectKey,
    size: info.size,
  });
  return { key: objectKey, size: info.size };
}

/**
 * Upload an in-memory buffer (e.g. an avatar image from multipart/form-data)
 * to the configured bucket under the *uploads* prefix. The uploads prefix is
 * separate from the backups prefix so DB dumps and user files never share a key.
 */
export async function uploadBuffer(opts: {
  key: string;
  body: Buffer;
  contentType: string;
  /**
   * Cache-Control to stamp on the object so a CDN/edge can cache it. Defaults
   * to the long-lived immutable policy from `getUploadCacheControl()` — safe
   * because upload keys are unique per write (timestamp + random suffix).
   */
  cacheControl?: string;
}): Promise<{ key: string; size: number; url: string }> {
  const cfg = readConfig();
  if (!cfg)
    throw new Error(
      "S3 backup not configured (BACKUP_S3_BUCKET + credentials)",
    );

  const uploadsPrefix = (process.env.UPLOADS_S3_PREFIX ?? "uploads/").replace(
    /\/?$/,
    "/",
  );
  const cleanKey = opts.key.replace(/^\/+/, "");
  const objectKey = `${uploadsPrefix}${cleanKey}`;
  const cacheControl = opts.cacheControl ?? getUploadCacheControl();

  await getClient(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: objectKey,
      Body: opts.body,
      ContentLength: opts.body.length,
      ContentType: opts.contentType,
      CacheControl: cacheControl,
    }),
  );

  // Prefer the dedicated uploads CDN/edge URL when configured; otherwise the
  // direct origin (S3/B2/R2) URL.
  const url = cdnURLForKey(cfg, objectKey);
  logger.info("Uploaded user file to S3", {
    bucket: cfg.bucket,
    key: objectKey,
    size: opts.body.length,
  });
  return { key: objectKey, size: opts.body.length, url };
}

// ── Edge / CDN delivery for user uploads ──────────────────────────────────────

/**
 * Cache-Control header stamped on uploaded objects (and echoed on the local-disk
 * fallback response) so a CDN/edge can cache them aggressively.
 *
 *   UPLOADS_CACHE_CONTROL   default "public, max-age=31536000, immutable"
 *
 * Upload keys are unique per write, so `immutable` is safe — a changed file gets
 * a new key, never a stale cache hit.
 */
export function getUploadCacheControl(): string {
  return (
    process.env.UPLOADS_CACHE_CONTROL?.trim() ||
    "public, max-age=31536000, immutable"
  );
}

/**
 * Base URL of the CDN/edge cache that fronts the uploads bucket, e.g.
 * `https://cdn.zerotrust.app`. Distinct from `BACKUP_S3_PUBLIC_URL_TEMPLATE`
 * (which targets the backups workflow): this one is dedicated to user-facing
 * upload delivery. Returns null (→ origin URL) when unset.
 *
 *   UPLOADS_CDN_URL   e.g. https://cdn.zerotrust.app
 */
export function uploadCdnBaseUrl(): string | null {
  const base = process.env.UPLOADS_CDN_URL?.trim();
  return base ? base.replace(/\/+$/, "") : null;
}

/**
 * Public delivery URL for an uploaded object key. Routes through the dedicated
 * uploads CDN (`UPLOADS_CDN_URL`) when configured, otherwise falls back to the
 * origin URL from `publicURLForKey()` (which itself honours
 * `BACKUP_S3_PUBLIC_URL_TEMPLATE`).
 */
export function cdnURLForKey(cfg: S3Config, objectKey: string): string {
  const cdn = uploadCdnBaseUrl();
  if (cdn) {
    const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
    return `${cdn}/${encodedKey}`;
  }
  return publicURLForKey(cfg, objectKey);
}

/**
 * Construct a public, path-style URL for an object in the configured bucket.
 *
 * Works for Backblaze B2, Cloudflare R2, MinIO, Wasabi, and any other
 * S3-compatible provider with `forcePathStyle=true`. For AWS S3 (virtual-hosted),
 * the public URL pattern is different — pass `BACKUP_S3_PUBLIC_URL_TEMPLATE` if
 * you need to override (e.g. behind a CDN or custom domain).
 */
export function publicURLForKey(cfg: S3Config, objectKey: string): string {
  // Percent-encode each path segment but keep "/" as the separator, so a nested
  // key like "uploads/avatars/u1.jpg" maps to a real URL path instead of
  // "uploads%2Favatars%2Fu1.jpg" (which most providers won't resolve).
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");

  const override = process.env.BACKUP_S3_PUBLIC_URL_TEMPLATE;
  if (override) {
    return override.replace("{key}", encodedKey);
  }
  if (!cfg.endpoint) {
    // AWS S3 virtual-hosted style (default SDK behaviour when no endpoint).
    return `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${encodedKey}`;
  }
  // Path-style: https://endpoint/bucket/key
  const base = cfg.endpoint.replace(/\/+$/, "");
  return `${base}/${cfg.bucket}/${encodedKey}`;
}

/**
 * Try to extract the S3 object key from a previously-stored public URL.
 * Returns null when the URL doesn't look like one of our S3 URLs (e.g.
 * it's a legacy local-disk avatar from before S3 was wired up).
 */
export function parseObjectKeyFromPublicUrl(publicUrl: string): string | null {
  try {
    const url = new URL(publicUrl);
    // Path-style: /<bucket>/<key...>
    const pathMatch = url.pathname.match(/^\/([^/]+)\/(.+)$/);
    if (
      pathMatch &&
      url.host &&
      (url.host.includes("backblaze") ||
        url.host.includes("r2.") ||
        url.host.includes("minio"))
    ) {
      return decodeURIComponent(pathMatch[2]);
    }
    // AWS virtual-hosted: https://<bucket>.s3.<region>.amazonaws.com/<key>
    const virtualMatch = url.host.match(/^([^.]+)\.s3\.[^.]+\.amazonaws\.com$/);
    if (virtualMatch) {
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (key) return key;
    }
    return null;
  } catch {
    return null;
  }
}

/** List all objects under the configured prefix. */
export async function listObjects(): Promise<S3Object[]> {
  const cfg = readConfig();
  if (!cfg) throw new Error("S3 backup not configured");

  const client = getClient(cfg);
  const out: S3Object[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        Prefix: cfg.prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key || obj.Size === undefined || !obj.LastModified) continue;
      out.push({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
      });
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  return out;
}

/** Delete a single object by its full key. */
export async function deleteObject(objectKey: string): Promise<void> {
  const cfg = readConfig();
  if (!cfg) throw new Error("S3 backup not configured");
  await getClient(cfg).send(
    new DeleteObjectCommand({ Bucket: cfg.bucket, Key: objectKey }),
  );
  logger.info("Deleted S3 object", { bucket: cfg.bucket, key: objectKey });
}

/**
 * Apply S3-side retention: delete any backup older than `maxAgeDays` based on
 * each object's LastModified timestamp. Returns the keys that were deleted.
 *
 * Uses batch delete (up to 1000 keys per request) to avoid N round-trips.
 */
export async function pruneOldBackups(maxAgeDays: number): Promise<string[]> {
  const cfg = readConfig();
  if (!cfg) throw new Error("S3 backup not configured");

  const cutoff = Date.now() - maxAgeDays * 86400_000;
  const objects = await listObjects();
  const stale = objects.filter((o) => o.lastModified.getTime() < cutoff);
  if (stale.length === 0) return [];

  const client = getClient(cfg);
  const pruned: string[] = [];

  // Batch in groups of 1000 (S3 hard limit on DeleteObjects).
  for (let i = 0; i < stale.length; i += 1000) {
    const batch = stale.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: cfg.bucket,
        Delete: {
          Objects: batch.map((o) => ({ Key: o.key })),
          Quiet: true,
        },
      }),
    );
    for (const o of batch) pruned.push(o.key);
  }

  logger.info("Pruned old S3 backups", { count: pruned.length, maxAgeDays });
  return pruned;
}
