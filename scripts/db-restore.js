#!/usr/bin/env node
// One-shot database restore from a pg_dump custom-format backup.
// Usage: bun run db:restore -- ./backups/zerotrust-<stamp>.dump[.enc] [--clean]
//   (or: node scripts/db-restore.js ./backups/<file>.dump[.enc])
// Env:  DATABASE_URL (required, target DB)
//       BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEY_HEX (required for .enc)
//       BACKUP_ENCRYPTED_METADATA_FILE (optional override for .enc.meta path)
//
// SAFETY: this writes into the target DATABASE_URL. Restoring a full dump over a
// live database is destructive — point DATABASE_URL at the intended target and
// pass --clean only when you mean to drop existing objects first.

const { spawn } = require("child_process");
const { createDecipheriv, scryptSync } = require("node:crypto");
const {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} = require("fs");
const os = require("node:os");
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
  console.error("✗ Usage: bun run db:restore -- <path-to-.dump[.enc]> [--clean]");
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
      // SECURITY (CWE-78): never use shell:true — args are passed as a literal
      // argv array so shell metacharacters in DATABASE_URL or file paths cannot
      // be interpreted. pg_dump / pg_restore resolve on PATH without a shell.
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
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
  if (!raw) {
    throw new Error(
      "Encrypted backup restore requires BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEY_HEX",
    );
  }
  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32 && base64.toString("base64") === raw) return base64;
  // SECURITY (CWE-327): static-salt scrypt is a legacy fallback. Prefer
  // BACKUP_ENCRYPTION_KEY_HEX (32 raw bytes as hex) — a static salt means the
  // same passphrase always derives the same key. This path is kept for
  // backwards compatibility with existing encrypted backups only.
  console.warn(
    "⚠ DEPRECATED: BACKUP_ENCRYPTION_KEY with a non-base64 value uses a static salt (CWE-327). " +
      "Set BACKUP_ENCRYPTION_KEY_HEX to a 32-byte hex string instead."
  );
  return scryptSync(raw, "zerotrust-db-backup", 32);
}

function encryptedMetadataFile(encryptedFile) {
  return path.resolve(
    process.env.BACKUP_ENCRYPTED_METADATA_FILE || `${encryptedFile}.meta`,
  );
}

function decryptBackup(encryptedFile) {
  const metaFile = encryptedMetadataFile(encryptedFile);
  if (!existsSync(metaFile)) {
    throw new Error(`Encrypted backup metadata not found: ${metaFile}`);
  }
  const metadata = JSON.parse(readFileSync(metaFile, "utf8"));
  if (metadata.algorithm !== "aes-256-gcm") {
    throw new Error(`Unsupported backup encryption algorithm: ${metadata.algorithm}`);
  }

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "zerotrust-restore-"));
  const decryptedFile = path.join(
    tempDir,
    path.basename(encryptedFile).replace(/\.enc$/, ""),
  );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(metadata.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(metadata.tag, "base64"));

  const complete = new Promise((resolve, reject) => {
    const input = createReadStream(encryptedFile);
    const output = createWriteStream(decryptedFile, { flags: "wx" });
    input.on("error", reject);
    decipher.on("error", reject);
    output.on("error", reject);
    output.on("finish", () => resolve(decryptedFile));
    input.pipe(decipher).pipe(output);
  });

  return { complete, tempDir };
}

(async () => {
  let restoreFile = file;
  let tempDir;
  if (file.endsWith(".enc")) {
    console.log(`→ Decrypting ${file} for restore`);
    const decrypted = decryptBackup(file);
    tempDir = decrypted.tempDir;
    restoreFile = await decrypted.complete;
  }

  try {
    console.log(`→ Restoring ${file} into the target database`);
    if (clean) console.log("  (--clean: dropping existing objects first)");
    const restoreArgs = [
      "--no-owner",
      "--no-privileges",
      ...(clean ? ["--clean", "--if-exists"] : []),
      `--dbname=${databaseUrl}`,
      restoreFile,
    ];
    await run("pg_restore", restoreArgs);
    console.log("✓ Restore complete");
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(`✗ Restore failed: ${err.message}`);
  console.error("  pg_restore must be installed and on PATH (it ships with PostgreSQL).");
  console.error("  Non-fatal relation/role warnings are expected with --no-owner restores.");
  process.exit(1);
});
