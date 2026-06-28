/**
 * CWE-78 / CWE-22 guards for the database backup service.
 *
 * These helpers are intentionally extracted from `src/services/dbBackup.service.ts`
 * so they can be:
 *   - unit-tested without dragging in the AWS SDK transitive graph;
 *   - reused by `scripts/db-backup.js` and `scripts/db-restore.js` so every
 *     spawn site follows the same closed allowlist + path validator.
 *
 * Rules:
 *   - The `run()` helper uses `shell: false` and a literal argv array, so
 *     shell metacharacters cannot be reinterpreted.
 *   - This module adds defense in depth:
 *       (a) `assertSafeCommand(name)` — closed allowlist of programs.
 *       (b) `assertSafeBackupDir(dir)` — reject shell metachars + `..` so
 *           a future helper that does invoke a shell can never be reached
 *           with an attacker-controlled directory.
 *       (c) `assertSafeBackupPath(file)` — pin the on-disk artifact shape to
 *           `<dir>/zerotrust-<stamp>.<ext>` and reject anything outside the
 *           configured BACKUP_DIR.
 *   - Error messages never include credentials or untrusted file contents.
 */

import path from "node:path";

/**
 * Closed allowlist of executables the backup service may spawn. Adding a new
 * program here is a deliberate security change; do not allow env vars or
 * caller input to influence the program name.
 */
const COMMAND_ALLOWLIST: ReadonlySet<string> = new Set(["pg_dump", "pg_restore", "psql"]);

/**
 * Metacharacters that would be reinterpreted by `sh -c`, `bash -c`, or by a
 * future helper that joins args into a command string. We reject any of these
 * in `assertSafeBackupDir` so an operator typo (or a malicious config) can't
 * produce a directory name that downstream code interprets as a shell command.
 */
const SHELL_METACHARS = /[`$;&|<>\\\n\r\0(){}[\]*?!#~]/;

/**
 * Reject a program name not on the closed allowlist. Callers should pass the
 * result into a spawn helper, never concatenate it with user input.
 */
export function assertSafeCommand(cmd: string): void {
  if (typeof cmd !== "string" || cmd.length === 0) {
    throw new Error("CWE-78: empty program name");
  }
  if (!COMMAND_ALLOWLIST.has(cmd)) {
    throw new Error(`CWE-78: program not on the backup allowlist: ${cmd}`);
  }
}

/**
 * Validate a `BACKUP_DIR` value before it becomes part of a file path.
 * Rejects:
 *   - shell metachars (defense-in-depth against a future shell-true PR),
 *   - `..` traversal segments (CWE-22),
 *   - NUL / control characters (CWE-20 / CWE-78).
 *
 * Does NOT enforce "is a real directory" — that happens at use time so this
 * helper remains a pure string check usable from CLI scripts.
 */
export function assertSafeBackupDir(dir: string): void {
  if (typeof dir !== "string" || dir.length === 0) {
    throw new Error("CWE-22/78: empty BACKUP_DIR");
  }
  if (SHELL_METACHARS.test(dir)) {
    throw new Error(`CWE-78: BACKUP_DIR contains shell metacharacters: ${JSON.stringify(dir)}`);
  }
  // Disallow `..` segments after normalising (so `./a/../b` is still rejected).
  const segments = dir.split(/[\\/]+/);
  for (const seg of segments) {
    if (seg === "..") {
      throw new Error(`CWE-22: BACKUP_DIR contains traversal segment: ${dir}`);
    }
  }
  // Disallow control chars + NUL (already covered by SHELL_METACHARS, but
  // explicit for diagnostics). The regex intentionally targets control chars
  // — that is the whole point of this validator.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional CWE-20 guard
  if (/[\x00-\x1f]/.test(dir)) {
    throw new Error(`CWE-20: BACKUP_DIR contains control characters`);
  }
}

/**
 * Validate that a path is a backup artifact produced by this service.
 *
 * Shape: `<dir>/zerotrust-<stamp>.<ext>` where `<ext>` is one of
 *   - `.dump`
 *   - `.dump.enc`
 *   - `.dump.enc.meta`
 *
 * The path must also resolve inside `backupDir` — that prevents a future
 * "trust the filename" PR from being tricked into reading `/etc/passwd`
 * via `path.basename(file)` interpolation.
 */
export function assertSafeBackupPath(file: string, backupDirResolved?: string): void {
  if (typeof file !== "string" || file.length === 0) {
    throw new Error("CWE-22: empty backup path");
  }
  if (SHELL_METACHARS.test(file)) {
    throw new Error(`CWE-78: backup path contains shell metacharacters`);
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

/**
 * Construct an argv-safe spawn options object that pins `shell: false`.
 * Use this everywhere the backup service launches a subprocess so a future
 * "let me debug with shell:true" PR cannot regress the CWE-78 mitigation.
 *
 * The default `stdio` is `["ignore", "ignore", "pipe"]` so callers can
 * capture stderr for scrubbing. Pass `extra.stdio` to override (e.g. the
 * CLI scripts want `inherit` so the operator sees pg_dump errors directly).
 */
export function safeSpawnOptions(extra?: {
  env?: NodeJS.ProcessEnv;
  stdio?: ["ignore", "ignore", "pipe"] | ["ignore", "inherit", "inherit"];
}): {
  env: NodeJS.ProcessEnv;
  stdio: ["ignore", "ignore", "pipe"] | ["ignore", "inherit", "inherit"];
  shell: false;
} {
  const defaultStdio: ["ignore", "ignore", "pipe"] = ["ignore", "ignore", "pipe"];
  return {
    env: { ...process.env, ...(extra?.env ?? {}) },
    stdio: extra?.stdio ?? defaultStdio,
    shell: false,
  };
}
