#!/usr/bin/env node
// One-shot database backup: pg_dump → ./backups with local retention +
// optional S3-compatible upload (AWS S3 / Backblaze B2 / Cloudflare R2 /
// MinIO / etc.). The S3 upload uses the AWS SDK directly — no aws CLI needed.
//
// Usage: bun run db:backup   (or: node scripts/db-backup.js)
//
// Env:   DATABASE_URL (required), BACKUP_DIR, BACKUP_RETENTION_DAYS,
//        BACKUP_S3_BUCKET, BACKUP_S3_ENDPOINT, BACKUP_S3_REGION,
//        BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY,
//        BACKUP_S3_PREFIX, BACKUP_S3_FORCE_PATH_STYLE, BACKUP_S3_RETENTION_DAYS

const { spawn } = require("node:child_process");
const { mkdirSync, readdirSync, statSync, unlinkSync, existsSync } = require("node:fs");
const path = require("node:path");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("✗ DATABASE_URL is not set (copy .env.example to .env)");
  process.exit(1);
}

const dir = path.resolve(process.env.BACKUP_DIR || "./backups");
const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10);
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = path.join(dir, `zerotrust-${stamp}.dump`);

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

function pruneLocal() {
  const cutoff = Date.now() - retentionDays * 86400000;
  let pruned = 0;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith("zerotrust-") || !name.endsWith(".dump")) continue;
    const full = path.join(dir, name);
    if (statSync(full).mtimeMs < cutoff) {
      unlinkSync(full);
      pruned++;
    }
  }
  return pruned;
}

async function uploadToS3(localFile, key) {
  // Lazy-require the SDK so the script still works without BACKUP_S3_* env.
  const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } =
    require("@aws-sdk/client-s3");
  const { createReadStream } = require("node:fs");

  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
  const bucket = process.env.BACKUP_S3_BUCKET;
  if (!accessKeyId || !secretAccessKey || !bucket) return false;

  const client = new S3Client({
    region: process.env.BACKUP_S3_REGION || "us-east-1",
    endpoint: process.env.BACKUP_S3_ENDPOINT || undefined,
    forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId, secretAccessKey },
  });

  const prefix = (process.env.BACKUP_S3_PREFIX || "backups/").endsWith("/")
    ? process.env.BACKUP_S3_PREFIX || "backups/"
    : `${process.env.BACKUP_S3_PREFIX || "backups"}/`;
  const objectKey = `${prefix}${key.replace(/^\/+/, "")}`;
  const stat = statSync(localFile);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: createReadStream(localFile),
      ContentLength: stat.size,
      ContentType: "application/octet-stream",
    })
  );
  console.log(`✓ Uploaded to s3://${bucket}/${objectKey}`);

  // Optional S3-side retention sweep.
  const s3Retention = parseInt(
    process.env.BACKUP_S3_RETENTION_DAYS || process.env.BACKUP_RETENTION_DAYS || "30",
    10
  );
  const cutoff = Date.now() - s3Retention * 86400000;
  let token;
  const stale = [];
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
    );
    for (const obj of res.Contents || []) {
      if (obj.LastModified && obj.LastModified.getTime() < cutoff && obj.Key) stale.push(obj.Key);
    }
    token = res.NextContinuationToken;
  } while (token);
  if (stale.length) {
    for (let i = 0; i < stale.length; i += 1000) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: stale.slice(i, i + 1000).map((k) => ({ Key: k })),
            Quiet: true,
          },
        })
      );
    }
    console.log(`✓ Pruned ${stale.length} stale S3 backup(s) older than ${s3Retention} days`);
  }
  return true;
}

(async () => {
  console.log(`→ Backing up database to ${file}`);
  await run("pg_dump", ["--format=custom", `--file=${file}`, databaseUrl]);
  console.log("✓ Backup complete");

  const pruned = pruneLocal();
  if (pruned) console.log(`✓ Pruned ${pruned} local backup(s) older than ${retentionDays} days`);

  if (process.env.BACKUP_S3_BUCKET) {
    try {
      await uploadToS3(file, path.basename(file));
    } catch (err) {
      console.error(`✗ S3 upload failed: ${err.message}`);
      console.error("  (Backup is still on local disk at " + file + ")");
    }
  }

  console.log(existsSync(file) ? `✓ Done: ${file}` : "✗ Backup file missing");
})().catch((err) => {
  console.error(`✗ Backup failed: ${err.message}`);
  console.error("  pg_dump must be installed and on PATH (it ships with PostgreSQL).");
  process.exit(1);
});