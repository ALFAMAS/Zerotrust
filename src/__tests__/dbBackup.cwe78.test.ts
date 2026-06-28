/**
 * CWE-78 hardening tests for src/services/dbBackup.service.ts.
 *
 * The production `run()` helper uses `shell: false` with a literal argv array,
 * which already prevents shell metachar interpretation. These tests pin that
 * behaviour so a future "let me just pipe through bash" PR can't regress:
 *
 *   1. `run()` never resolves args through a shell (`shell` is forced false).
 *   2. The resolved `BACKUP_DIR` is rejected if it contains shell metachars
 *      or path-traversal segments, so the resulting dump file path can never
 *      be reinterpreted by a downstream helper that does invoke a shell.
 *   3. The dump-file path itself is locked to `<dir>/zerotrust-<stamp>.<ext>`
 *      — anything else is a CWE-22/CWE-78 bug-in-waiting.
 *   4. `DATABASE_URL` is never echoed in error messages or logs.
 *   5. The command allowlist is closed: only `pg_dump`, `pg_restore`,
 *      `psql` are acceptable; every other program name throws.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted to module top level (vitest hoists vi.mock regardless; keeping it here
// reflects the real execution order and silences the nested-mock warning).
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
  unlink: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// ESM does not allow vi.spyOn on a module's named export (`spawn`), so replace
// the module with a controllable mock fn instead.
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const REAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...REAL_ENV };
  delete process.env.BACKUP_DIR;
  delete process.env.BACKUP_RETENTION_DAYS;
  delete process.env.BACKUP_ENCRYPTION_KEY_HEX;
  delete process.env.BACKUP_ENCRYPTION_KEY;
  delete process.env.BACKUP_REQUIRE_ENCRYPTION;
});

afterEach(() => {
  process.env = REAL_ENV;
  vi.restoreAllMocks();
});

const childProcess = await import("node:child_process");

describe("dbBackup — CWE-78 run() guard", () => {
  it("forwards argv as a literal array with shell:false", async () => {
    const spawnSpy = vi.mocked(childProcess.spawn);
    spawnSpy.mockReturnValue({
      on: (event: string, cb: (code: number) => void) => {
        if (event === "close") setImmediate(() => cb(0));
      },
      stderr: { on: () => {} },
    } as never);

    // Force a successful backup to exercise run("pg_dump", ...)
    process.env.DATABASE_URL = "postgres://user:pass@host:5432/db";
    process.env.BACKUP_DIR = "./backups-test";

    const { runBackup } = await import("../services/dbBackup.service");
    const res = await runBackup();
    expect(res.ok).toBe(true);

    // Find the pg_dump call (run("pg_dump", ...))
    const pgDumpCall = spawnSpy.mock.calls.find(([cmd]) => cmd === "pg_dump");
    expect(pgDumpCall, "expected pg_dump spawn").toBeTruthy();
    const [cmd, args, opts] = pgDumpCall!;
    expect(cmd).toBe("pg_dump");
    expect(Array.isArray(args)).toBe(true);
    // SECURITY (CWE-78): shell must NEVER be true — it would re-introduce
    // command-injection through env-controlled args.
    expect((opts as { shell?: boolean }).shell).toBe(false);
    // Every arg is a discrete string entry; no shell-joined blob.
    for (const a of args as string[]) {
      expect(typeof a).toBe("string");
    }
  });

  it("rejects a BACKUP_DIR that contains shell metacharacters", async () => {
    const { assertSafeBackupDir } = await import("../services/dbBackup.service");
    expect(() => assertSafeBackupDir("/tmp/innocent;rm -rf /")).toThrowError(
      /metachar|reject|invalid/i
    );
  });

  it("rejects a BACKUP_DIR that contains path-traversal segments", async () => {
    process.env.BACKUP_DIR = "/tmp/legit/../../etc";
    const { assertSafeBackupDir } = await import("../services/dbBackup.service");
    expect(() => assertSafeBackupDir("/tmp/legit/../../etc")).toThrowError(
      /traversal|invalid|\.\./
    );
  });

  it("accepts an absolute BACKUP_DIR with no metachars", async () => {
    const { assertSafeBackupDir } = await import("../services/dbBackup.service");
    expect(() => assertSafeBackupDir("/var/lib/zerotrust/backups")).not.toThrow();
    expect(() => assertSafeBackupDir("./backups")).not.toThrow();
  });
});

describe("dbBackup — DATABASE_URL credential safety (CWE-532)", () => {
  it("never includes the DATABASE_URL password in any error message", async () => {
    process.env.DATABASE_URL = "postgres://user:supersecret-pw@host:5432/db";
    process.env.BACKUP_DIR = "./backups-test";

    const spawnSpy = vi.mocked(childProcess.spawn);
    spawnSpy.mockReturnValue({
      on: (event: string, cb: (code: number) => void) => {
        if (event === "close") setImmediate(() => cb(1)); // non-zero exit
      },
      stderr: { on: (_e: string, cb: (b: Buffer) => void) => cb(Buffer.from("boom")) },
    } as never);

    const { runBackup } = await import("../services/dbBackup.service");
    const res = await runBackup();

    expect(res.ok).toBe(false);
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain("supersecret-pw");
    expect(spawnSpy).toHaveBeenCalled();
  });
});

describe("dbBackup — closed command allowlist", () => {
  it("refuses to spawn anything outside the allowlist", async () => {
    const { assertSafeCommand } = await import("../services/dbBackup.service");
    expect(() => assertSafeCommand("pg_dump")).not.toThrow();
    expect(() => assertSafeCommand("pg_restore")).not.toThrow();
    expect(() => assertSafeCommand("psql")).not.toThrow();
    expect(() => assertSafeCommand("/usr/bin/rm")).toThrowError(/allowlist|denied/i);
    expect(() => assertSafeCommand("bash")).toThrowError(/allowlist|denied/i);
    expect(() => assertSafeCommand("sh")).toThrowError(/allowlist|denied/i);
    expect(() => assertSafeCommand("")).toThrowError(/allowlist|denied|empty/i);
  });
});

describe("dbBackup — dump file path shape", () => {
  it("resolves to <dir>/zerotrust-<stamp>.dump(.enc)?(.meta)?", async () => {
    process.env.BACKUP_DIR = "./backups-test";
    const { assertSafeBackupPath } = await import("../services/dbBackup.service");
    expect(() => assertSafeBackupPath("./backups-test/zerotrust-2025-01-01T00-00-00.dump")).not.toThrow();
    expect(() =>
      assertSafeBackupPath("./backups-test/zerotrust-2025-01-01T00-00-00.dump.enc")
    ).not.toThrow();
    expect(() =>
      assertSafeBackupPath("./backups-test/zerotrust-2025-01-01T00-00-00.dump.enc.meta")
    ).not.toThrow();
  });

  it("rejects paths outside BACKUP_DIR or with the wrong prefix", async () => {
    const { assertSafeBackupPath } = await import("../services/dbBackup.service");
    expect(() => assertSafeBackupPath("/etc/passwd")).toThrowError(/artifact|invalid/i);
    expect(() => assertSafeBackupPath("./backups-test/random.dump")).toThrowError(
      /artifact|invalid/i
    );
    expect(() => assertSafeBackupPath("./backups-test/zerotrust-x..dump")).toThrowError(
      /artifact|invalid/i
    );
  });
});