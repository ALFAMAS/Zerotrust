// src/services/dbBackup.service.ts
import { spawn } from "node:child_process";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { createReadStream as createReadStream2, createWriteStream } from "node:fs";
import { mkdir, readdir, stat as stat2, unlink, writeFile } from "node:fs/promises";
import * as path2 from "node:path";

// src/config/index.ts
function generateSecureKey(byteLength) {
  if (typeof crypto === "undefined") {
    throw new Error("Crypto API not available. Node.js 15+ required.");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var DEFAULT_CONFIG = {
  database: {
    databaseUrl: process.env.DATABASE_URL || "postgresql://neon_owner:***@ep-noisy-hill-a1hjd9xk-pooler.ap-southeast-1.aws.neon.tech/neon?sslmode=require&channel_binding=require",
    databaseUrlReadReplica: process.env.DATABASE_URL_READ_REPLICA || undefined,
    connectionPoolSize: parseInt(process.env.DB_POOL_SIZE || "10", 10),
    readReplicaPoolSize: parseInt(process.env.DB_READ_POOL_SIZE || "20", 10)
  },
  session: {
    defaultTTL: parseInt(process.env.SESSION_TTL || "3600", 10),
    refreshTokenTTL: parseInt(process.env.REFRESH_TOKEN_TTL || "604800", 10),
    maxConcurrentDevices: parseInt(process.env.MAX_CONCURRENT_DEVICES || "5", 10)
  },
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || "12", 10),
    tokenSecretHex: process.env.TOKEN_SECRET_HEX || generateSecureKey(32),
    csfleMasterKeyHex: process.env.CSFLE_MASTER_KEY_HEX || generateSecureKey(32),
    csflekeyRotationIntervalDays: parseInt(process.env.CSFLE_KEY_ROTATION_DAYS || "90", 10)
  },
  oauth: {
    providers: {
      google: {
        clientId: process.env.OAUTH_GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET || "",
        redirectUri: process.env.OAUTH_GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/oauth/google/callback"
      },
      facebook: {
        clientId: process.env.OAUTH_FACEBOOK_CLIENT_ID || "",
        clientSecret: process.env.OAUTH_FACEBOOK_CLIENT_SECRET || "",
        redirectUri: process.env.OAUTH_FACEBOOK_REDIRECT_URI || "http://localhost:3000/auth/oauth/facebook/callback"
      },
      github: {
        clientId: process.env.OAUTH_GITHUB_CLIENT_ID || "",
        clientSecret: process.env.OAUTH_GITHUB_CLIENT_SECRET || "",
        redirectUri: process.env.OAUTH_GITHUB_REDIRECT_URI || "http://localhost:3000/auth/oauth/github/callback"
      },
      apple: {
        clientId: process.env.OAUTH_APPLE_CLIENT_ID || "",
        clientSecret: process.env.OAUTH_APPLE_CLIENT_SECRET || "",
        redirectUri: process.env.OAUTH_APPLE_REDIRECT_URI || "http://localhost:3000/auth/oauth/apple/callback"
      }
    }
  },
  mfa: {
    totpWindow: parseInt(process.env.TOTP_WINDOW || "1", 10),
    otpExpirySecs: parseInt(process.env.OTP_EXPIRY_SECS || "900", 10),
    maxOTPAttempts: parseInt(process.env.MAX_OTP_ATTEMPTS || "5", 10),
    channels: {
      email: { enabled: process.env.MFA_EMAIL_ENABLED !== "false" },
      sms: {
        enabled: process.env.MFA_SMS_ENABLED === "true",
        provider: process.env.SMS_PROVIDER || "twilio"
      },
      whatsapp: {
        enabled: process.env.MFA_WHATSAPP_ENABLED === "true",
        provider: process.env.WHATSAPP_PROVIDER || "twilio"
      },
      telegram: {
        enabled: process.env.MFA_TELEGRAM_ENABLED === "true",
        botToken: process.env.TELEGRAM_BOT_TOKEN || ""
      }
    }
  },
  rateLimiting: {
    enabled: process.env.RATE_LIMITING_ENABLED !== "false",
    redisUri: process.env.REDIS_URI,
    perIpLimit: parseInt(process.env.RATE_LIMIT_PER_IP || "100", 10),
    windowSecs: parseInt(process.env.RATE_LIMIT_WINDOW_SECS || "60", 10)
  },
  geofencing: {
    enabled: process.env.GEOFENCING_ENABLED === "true",
    allowedCountries: (process.env.ALLOWED_COUNTRIES || "US,AU,EU,BD,IN").split(","),
    allowedIpRanges: (process.env.ALLOWED_IP_RANGES || "").split(",").filter(Boolean)
  },
  elasticsearch: {
    enabled: process.env.ELASTICSEARCH_ENABLED === "true",
    host: process.env.ELASTICSEARCH_HOST || "localhost",
    port: parseInt(process.env.ELASTICSEARCH_PORT || "9200", 10),
    indexPrefix: process.env.ELASTICSEARCH_INDEX_PREFIX || "zerotrust"
  },
  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: process.env.LOG_FORMAT || "json"
  }
};
function loadConfig() {
  const config = DEFAULT_CONFIG;
  validateConfig(config);
  return config;
}
function validateConfig(config) {
  const errors = [];
  if (!config.database.databaseUrl) {
    errors.push("DATABASE_URL environment variable is required");
  }
  if (!config.security.tokenSecretHex || config.security.tokenSecretHex.length < 64) {
    errors.push("TOKEN_SECRET_HEX must be at least 32 bytes (64 hex chars)");
  }
  if (!config.security.csfleMasterKeyHex || config.security.csfleMasterKeyHex.length < 64) {
    errors.push("CSFLE_MASTER_KEY_HEX must be at least 32 bytes (64 hex chars)");
  }
  let hasValidOAuth = false;
  for (const creds of Object.values(config.oauth.providers)) {
    if (creds.clientId && creds.clientSecret) {
      hasValidOAuth = true;
    }
  }
  if (!hasValidOAuth) {
    console.warn("WARNING: No OAuth providers configured. Set OAUTH_*_CLIENT_ID and OAUTH_*_CLIENT_SECRET");
  }
  const mfaChannelsEnabled = Object.values(config.mfa.channels).filter((c) => c.enabled).length;
  if (mfaChannelsEnabled === 0) {
    errors.push("At least one MFA channel must be enabled");
  }
  if (config.mfa.channels.telegram.enabled && !config.mfa.channels.telegram.botToken) {
    errors.push("TELEGRAM_BOT_TOKEN required when MFA_TELEGRAM_ENABLED=true");
  }
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:
${errors.join(`
`)}`);
  }
}
var configInstance = null;
function getConfig() {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

// src/shared/safeFetch.ts
import { isIP } from "node:net";

// src/logger/index.ts
var LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

class Logger {
  config;
  context = {};
  minLogLevel;
  elasticsearchClient;
  constructor(config, contextModule) {
    this.config = config;
    this.minLogLevel = LOG_LEVELS[config.logging.level];
    if (contextModule) {
      this.context.module = contextModule;
    }
  }
  setCorrelationId(id) {
    this.context.correlationId = id;
  }
  setUserContext(userId, sessionId) {
    this.context.userId = userId;
    if (sessionId)
      this.context.sessionId = sessionId;
  }
  setRequestContext(ipAddress, userAgent) {
    this.context.ipAddress = ipAddress;
    if (userAgent)
      this.context.userAgent = userAgent;
  }
  clearContext() {
    this.context = {};
  }
  debug(message, data) {
    this.log("debug", message, data);
  }
  info(message, data) {
    this.log("info", message, data);
  }
  warn(message, data) {
    this.log("warn", message, data);
  }
  error(message, error) {
    const errorData = error instanceof Error ? {
      errorMessage: error.message,
      errorStack: error.stack,
      errorName: error.name
    } : error;
    this.log("error", message, errorData);
  }
  log(level, message, data) {
    if (LOG_LEVELS[level] < this.minLogLevel) {
      return;
    }
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...data
    };
    if (this.config.logging.format === "json") {
      process.stdout.write(`${JSON.stringify(logEntry)}
`);
    } else {
      const levelColor = this.getLevelColor(level);
      const timestamp = String(logEntry.timestamp);
      const correlationId = logEntry.correlationId ? ` [${String(logEntry.correlationId)}]` : "";
      const userId = logEntry.userId ? ` [user:${String(logEntry.userId)}]` : "";
      const reset = "\x1B[0m";
      process.stdout.write(`${timestamp} ${levelColor}${level.toUpperCase()}${reset}${correlationId}${userId} ${message}
`);
    }
    if (this.config.elasticsearch.enabled && level !== "debug") {
      this.streamToElasticsearch(logEntry).catch((err) => {
        console.error("Failed to stream log to Elasticsearch:", err);
      });
    }
  }
  async streamToElasticsearch(logEntry) {
    if (!this.elasticsearchClient) {
      return;
    }
    try {
      const indexName = `${this.config.elasticsearch.indexPrefix}-logs-${new Date().toISOString().split("T")[0]}`;
      await this.elasticsearchClient.index({
        index: indexName,
        document: logEntry
      });
    } catch (error) {
      console.error("Failed to index log in Elasticsearch:", error);
    }
  }
  getLevelColor(level) {
    const colors = {
      debug: "\x1B[36m",
      info: "\x1B[32m",
      warn: "\x1B[33m",
      error: "\x1B[31m"
    };
    return colors[level];
  }
  setElasticsearchClient(client) {
    this.elasticsearchClient = client;
  }
}
var loggerSingleton = null;
function getLogger(module) {
  if (!loggerSingleton) {
    const cfg = getConfig();
    loggerSingleton = new Logger(cfg, module);
  }
  return loggerSingleton;
}

// src/shared/safeBackupPaths.ts
import path from "node:path";
var COMMAND_ALLOWLIST = new Set(["pg_dump", "pg_restore", "psql"]);
var SHELL_METACHARS = /[`$;&|<>\\\n\r\0(){}[\]*?!#~]/;
function assertSafeCommand(cmd) {
  if (typeof cmd !== "string" || cmd.length === 0) {
    throw new Error("CWE-78: empty program name");
  }
  if (!COMMAND_ALLOWLIST.has(cmd)) {
    throw new Error(`CWE-78: program not on the backup allowlist: ${cmd}`);
  }
}
function assertSafeBackupDir(dir) {
  if (typeof dir !== "string" || dir.length === 0) {
    throw new Error("CWE-22/78: empty BACKUP_DIR");
  }
  if (SHELL_METACHARS.test(dir)) {
    throw new Error(`CWE-78: BACKUP_DIR contains shell metacharacters: ${JSON.stringify(dir)}`);
  }
  const segments = dir.split(/[\\/]+/);
  for (const seg of segments) {
    if (seg === "..") {
      throw new Error(`CWE-22: BACKUP_DIR contains traversal segment: ${dir}`);
    }
  }
  if (/[\x00-\x1f]/.test(dir)) {
    throw new Error(`CWE-20: BACKUP_DIR contains control characters`);
  }
}
function assertSafeBackupPath(file, backupDirResolved) {
  if (typeof file !== "string" || file.length === 0) {
    throw new Error("CWE-22: empty backup path");
  }
  if (SHELL_METACHARS.test(file)) {
    throw new Error(`CWE-78: backup path contains shell metacharacters`);
  }
  const basename = path.basename(file);
  const ARTIFACT_RE = /^zerotrust-[0-9TZ:_-]+\.dump(?:\.enc(?:\.meta)?)?$/;
  if (!ARTIFACT_RE.test(basename)) {
    throw new Error(`CWE-22: backup path is not a zerotrust-<stamp>.dump[.enc[.meta]] artifact: ${basename}`);
  }
  if (backupDirResolved) {
    const root = path.resolve(backupDirResolved);
    const resolved = path.resolve(file);
    const rel = path.relative(root, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`CWE-22: backup path escapes BACKUP_DIR (${root}): ${resolved}`);
    }
  }
}
function safeSpawnOptions(extra) {
  const defaultStdio = ["ignore", "ignore", "pipe"];
  return {
    env: { ...process.env, ...extra?.env ?? {} },
    stdio: extra?.stdio ?? defaultStdio,
    shell: false
  };
}

// src/services/objectStorage.service.ts
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
var logger = getLogger("object-storage");
function readConfig() {
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
    forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE === "true"
  };
}
var _client = null;
var _clientConfigKey = "";
function getClient(cfg) {
  const key = `${cfg.endpoint ?? ""}|${cfg.region}|${cfg.accessKeyId}|${cfg.forcePathStyle}`;
  if (!_client || _clientConfigKey !== key) {
    _client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey
      }
    });
    _clientConfigKey = key;
  }
  return _client;
}
function isS3BackupEnabled() {
  return readConfig() !== null;
}
function s3RetentionDays() {
  const explicit = process.env.BACKUP_S3_RETENTION_DAYS;
  if (explicit)
    return parseInt(explicit, 10);
  const fallback = process.env.BACKUP_RETENTION_DAYS;
  if (fallback)
    return parseInt(fallback, 10);
  return 30;
}
function fullKey(cfg, key) {
  const prefix = cfg.prefix.endsWith("/") ? cfg.prefix : `${cfg.prefix}/`;
  return `${prefix}${key.replace(/^\/+/, "")}`;
}
async function uploadFile(localPath, key) {
  const cfg = readConfig();
  if (!cfg)
    throw new Error("S3 backup not configured (BACKUP_S3_BUCKET + credentials)");
  const info = await stat(localPath);
  const objectKey = fullKey(cfg, key);
  const body = createReadStream(localPath);
  await getClient(cfg).send(new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: objectKey,
    Body: body,
    ContentLength: info.size,
    ContentType: "application/octet-stream"
  }));
  logger.info("Uploaded to S3-compatible storage", {
    bucket: cfg.bucket,
    key: objectKey,
    size: info.size
  });
  return { key: objectKey, size: info.size };
}
async function listObjects() {
  const cfg = readConfig();
  if (!cfg)
    throw new Error("S3 backup not configured");
  const client = getClient(cfg);
  const out = [];
  let continuationToken;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: cfg.bucket,
      Prefix: cfg.prefix,
      ContinuationToken: continuationToken
    }));
    for (const obj of res.Contents ?? []) {
      if (!obj.Key || obj.Size === undefined || !obj.LastModified)
        continue;
      out.push({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified
      });
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);
  return out;
}
async function pruneOldBackups(maxAgeDays) {
  const cfg = readConfig();
  if (!cfg)
    throw new Error("S3 backup not configured");
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const objects = await listObjects();
  const stale = objects.filter((o) => o.lastModified.getTime() < cutoff);
  if (stale.length === 0)
    return [];
  const client = getClient(cfg);
  const pruned = [];
  for (let i = 0;i < stale.length; i += 1000) {
    const batch = stale.slice(i, i + 1000);
    await client.send(new DeleteObjectsCommand({
      Bucket: cfg.bucket,
      Delete: {
        Objects: batch.map((o) => ({ Key: o.key })),
        Quiet: true
      }
    }));
    for (const o of batch)
      pruned.push(o.key);
  }
  logger.info("Pruned old S3 backups", { count: pruned.length, maxAgeDays });
  return pruned;
}

// src/services/dbBackup.service.ts
var logger2 = getLogger("db-backup");
function backupDir() {
  const raw = process.env.BACKUP_DIR ?? "./backups";
  assertSafeBackupDir(raw);
  return path2.resolve(raw);
}
function retentionDays() {
  return parseInt(process.env.BACKUP_RETENTION_DAYS ?? "30", 10);
}
function encryptionKey() {
  const hex = process.env.BACKUP_ENCRYPTION_KEY_HEX;
  if (hex) {
    const key = Buffer.from(hex, "hex");
    if (key.length !== 32) {
      throw new Error("BACKUP_ENCRYPTION_KEY_HEX must decode to 32 bytes");
    }
    return key;
  }
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw)
    return null;
  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32 && base64.toString("base64") === raw)
    return base64;
  logger2.warn("BACKUP_ENCRYPTION_KEY with a non-base64 value uses a static salt (CWE-327). Set BACKUP_ENCRYPTION_KEY_HEX to a 32-byte hex string instead.");
  return scryptSync(raw, "zerotrust-db-backup", 32);
}
function backupEncryptionKey() {
  const key = encryptionKey();
  if (!key && process.env.BACKUP_REQUIRE_ENCRYPTION === "true") {
    throw new Error("BACKUP_REQUIRE_ENCRYPTION=true but BACKUP_ENCRYPTION_KEY is not set");
  }
  return key;
}
async function encryptBackup(file, key) {
  if (!key) {
    logger2.warn("Database backup encryption disabled; set BACKUP_ENCRYPTION_KEY to encrypt backups at rest");
    return null;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encryptedFile = `${file}.enc`;
  await new Promise((resolve2, reject) => {
    const input = createReadStream2(file);
    const output = createWriteStream(encryptedFile);
    input.on("error", reject);
    cipher.on("error", reject);
    output.on("error", reject);
    output.on("finish", resolve2);
    input.pipe(cipher).pipe(output);
  });
  const tag = cipher.getAuthTag();
  await writeFile(`${encryptedFile}.meta`, `${JSON.stringify({
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64")
  })}
`, { flag: "wx" });
  await unlink(file);
  logger2.info("Database backup encrypted", { file: encryptedFile });
  return encryptedFile;
}
function isBackupArtifact(name) {
  return name.startsWith("zerotrust-") && (name.endsWith(".dump") || name.endsWith(".dump.enc") || name.endsWith(".dump.enc.meta"));
}
function run(cmd, args, env) {
  assertSafeCommand(cmd);
  for (const a of args) {
    if (typeof a !== "string") {
      throw new Error("CWE-78: spawn arg must be a string");
    }
  }
  return new Promise((resolve2, reject) => {
    const child = spawn(cmd, args, safeSpawnOptions({ env }));
    let stderr = "";
    child.stderr?.on("data", (d) => stderr += d.toString());
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve2(0) : reject(new Error(`${cmd} exited ${code}: ${scrubCredentials(stderr).slice(0, 500)}`)));
  });
}
function scrubCredentials(input) {
  return input.replace(/\bpassword=[^\s&]+/gi, "password=***").replace(/(\bpostgres:\/\/[^:\s]+):[^@\s]+@/gi, "$1:***@");
}
async function pruneOldBackups2() {
  const dir = backupDir();
  const cutoff = Date.now() - retentionDays() * 86400000;
  const pruned = [];
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return pruned;
  }
  for (const name of entries) {
    if (!isBackupArtifact(name))
      continue;
    const full = path2.join(dir, name);
    try {
      const info = await stat2(full);
      if (info.mtimeMs < cutoff) {
        await unlink(full);
        pruned.push(name);
      }
    } catch {}
  }
  return pruned;
}
async function runBackup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { ok: false, pruned: [], error: "DATABASE_URL not set" };
  }
  const dir = backupDir();
  await mkdir(dir, { recursive: true });
  let key;
  try {
    key = backupEncryptionKey();
  } catch (err) {
    logger2.error("Database backup encryption is misconfigured", err);
    return { ok: false, pruned: [], error: String(err) };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  let file = path2.join(dir, `zerotrust-${stamp}.dump`);
  assertSafeBackupPath(file, dir);
  try {
    await run("pg_dump", ["--format=custom", `--file=${file}`, databaseUrl]);
    logger2.info("Database backup written", { file });
    const encryptedFile = await encryptBackup(file, key);
    if (encryptedFile)
      file = encryptedFile;
  } catch (err) {
    logger2.error("pg_dump failed", err);
    try {
      await unlink(file);
    } catch {}
    return { ok: false, pruned: [], error: String(err) };
  }
  const pruned = await pruneOldBackups2();
  if (pruned.length)
    logger2.info("Pruned old local backups", { count: pruned.length });
  let uploaded = false;
  let s3Pruned;
  if (isS3BackupEnabled()) {
    try {
      const key2 = path2.basename(file);
      await uploadFile(file, key2);
      if (file.endsWith(".enc")) {
        await uploadFile(`${file}.meta`, `${key2}.meta`);
      }
      uploaded = true;
      s3Pruned = await pruneOldBackups(s3RetentionDays());
      if (s3Pruned.length) {
        logger2.info("S3 retention sweep complete", { count: s3Pruned.length });
      }
    } catch (err) {
      logger2.error("S3 upload/prune failed (backup kept locally)", err);
    }
  }
  return { ok: true, file, uploaded, encrypted: file.endsWith(".enc"), pruned, s3Pruned };
}
var backupInterval = null;
function startBackupScheduler(intervalHours = 24) {
  if (process.env.BACKUP_ENABLED !== "true") {
    logger2.info("DB backup scheduler disabled (set BACKUP_ENABLED=true to enable)");
    return;
  }
  if (backupInterval)
    clearInterval(backupInterval);
  backupInterval = setInterval(() => {
    runBackup();
  }, intervalHours * 60 * 60 * 1000);
  if (backupInterval.unref)
    backupInterval.unref();
  logger2.info("DB backup scheduler started", { intervalHours });
}
function stopBackupScheduler() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}
export {
  stopBackupScheduler,
  startBackupScheduler,
  scrubCredentials,
  runBackup,
  pruneOldBackups2 as pruneOldBackups,
  assertSafeCommand,
  assertSafeBackupPath,
  assertSafeBackupDir
};
