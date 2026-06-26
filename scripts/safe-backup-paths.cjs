/**
 * CJS mirror of src/shared/safeBackupPaths.ts.
 *
 * The backup CLI scripts (scripts/db-backup.js, scripts/db-restore.js) are
 * run with plain Node and cannot import the TS source directly. This mirror
 * keeps the closed-allowlist / path-validation rules in a single place so
 * the TS service and the CLI scripts cannot drift.
 *
 * KEEP IN SYNC with src/shared/safeBackupPaths.ts. The smoke runner
 * scripts/smoke-dbbackup-cwe78.mjs validates the TS source; the same
 * assertions apply here.
 */

const path = require("node:path");

const COMMAND_ALLOWLIST = new Set(["pg_dump", "pg_restore", "psql"]);
const SHELL_METACHARS = /[`$;&|<>\\\n\r\0(){}[\]*?!#~]/;

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
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional CWE-20 guard
  if (/[\x00-\x1f]/.test(dir)) {
    throw new Error("CWE-20: BACKUP_DIR contains control characters");
  }
}

function assertSafeBackupPath(file, backupDirResolved) {
  if (typeof file !== "string" || file.length === 0) {
    throw new Error("CWE-22: empty backup path");
  }
  if (SHELL_METACHARS.test(file)) {
    throw new Error("CWE-78: backup path contains shell metacharacters");
  }
  const basename = path.basename(file);
  const ARTIFACT_RE = /^zerotrust-[0-9TZ:_-]+\.dump(?:\.enc(?:\.meta)?)?$/;
  if (!ARTIFACT_RE.test(basename)) {
    throw new Error(
      `CWE-22: backup path is not a zerotrust-<stamp>.dump[.enc[.meta]] artifact: ${basename}`
    );
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
    env: { ...process.env, ...((extra && extra.env) || {}) },
    stdio: extra?.stdio || defaultStdio,
    shell: false,
  };
}

module.exports = {
  assertSafeCommand,
  assertSafeBackupDir,
  assertSafeBackupPath,
  safeSpawnOptions,
};
