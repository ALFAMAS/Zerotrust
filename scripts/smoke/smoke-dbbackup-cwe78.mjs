// CWE-78 hardening smoke for src/shared/safeBackupPaths.ts.
// Exercises the same assertions as src/__tests__/dbBackup.cwe78.test.ts so the
// guards fail loudly before vitest is available locally on Windows. This smoke
// imports only the lightweight shared module so it doesn't drag in the AWS
// SDK transitive graph that breaks Node ESM resolution against the bun store.

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`  ok  ${label}`);
}

console.log("\n== src/shared/safeBackupPaths.ts (CWE-78 hardening) ==");

const mod = await import("../src/shared/safeBackupPaths.ts");

// 1. Closed command allowlist (CWE-78).
{
  assert("assertSafeCommand accepts pg_dump", (() => { try { mod.assertSafeCommand("pg_dump"); return true; } catch { return false; } })());
  assert("assertSafeCommand accepts pg_restore", (() => { try { mod.assertSafeCommand("pg_restore"); return true; } catch { return false; } })());
  assert("assertSafeCommand accepts psql", (() => { try { mod.assertSafeCommand("psql"); return true; } catch { return false; } })());
  assert("assertSafeCommand rejects /usr/bin/rm", (() => { try { mod.assertSafeCommand("/usr/bin/rm"); return false; } catch { return true; } })());
  assert("assertSafeCommand rejects bash", (() => { try { mod.assertSafeCommand("bash"); return false; } catch { return true; } })());
  assert("assertSafeCommand rejects sh", (() => { try { mod.assertSafeCommand("sh"); return false; } catch { return true; } })());
  assert("assertSafeCommand rejects empty string", (() => { try { mod.assertSafeCommand(""); return false; } catch { return true; } })());
  assert("assertSafeCommand rejects non-string", (() => { try { mod.assertSafeCommand(/** @type {any} */ (123)); return false; } catch { return true; } })());
}

// 2. BACKUP_DIR metachar / traversal rejection.
{
  assert(
    "BACKUP_DIR with `;` is rejected",
    (() => { try { mod.assertSafeBackupDir("/tmp/innocent;rm -rf /"); return false; } catch { return true; } })()
  );
  assert(
    "BACKUP_DIR with `&&` injection is rejected",
    (() => { try { mod.assertSafeBackupDir("/tmp/x && curl evil"); return false; } catch { return true; } })()
  );
  assert(
    "BACKUP_DIR with backtick substitution is rejected",
    (() => { try { mod.assertSafeBackupDir("/tmp/`whoami`"); return false; } catch { return true; } })()
  );
  assert(
    "BACKUP_DIR with `$(...)` substitution is rejected",
    (() => { try { mod.assertSafeBackupDir("/tmp/$(id)"); return false; } catch { return true; } })()
  );
  assert(
    "BACKUP_DIR with .. traversal is rejected",
    (() => { try { mod.assertSafeBackupDir("/tmp/legit/../../etc"); return false; } catch { return true; } })()
  );
  assert(
    "BACKUP_DIR with newline is rejected",
    (() => { try { mod.assertSafeBackupDir("/tmp/x\nrm"); return false; } catch { return true; } })()
  );
  assert(
    "BACKUP_DIR with NUL byte is rejected",
    (() => { try { mod.assertSafeBackupDir("/tmp/x\0"); return false; } catch { return true; } })()
  );
  assert(
    "BACKUP_DIR with pipe is rejected",
    (() => { try { mod.assertSafeBackupDir("/tmp/x|curl evil"); return false; } catch { return true; } })()
  );
  assert(
    "BACKUP_DIR with redirect is rejected",
    (() => { try { mod.assertSafeBackupDir("/tmp/x>etc"); return false; } catch { return true; } })()
  );
  assert(
    "clean absolute BACKUP_DIR is accepted",
    (() => { try { mod.assertSafeBackupDir("/var/lib/zerotrust/backups"); return true; } catch { return false; } })()
  );
  assert(
    "clean relative BACKUP_DIR is accepted",
    (() => { try { mod.assertSafeBackupDir("./backups"); return true; } catch { return false; } })()
  );
  assert(
    "empty BACKUP_DIR is rejected",
    (() => { try { mod.assertSafeBackupDir(""); return false; } catch { return true; } })()
  );
}

// 3. Backup path shape + containment.
{
  assert(
    "valid zerotrust-<stamp>.dump path is accepted",
    (() => { try { mod.assertSafeBackupPath("./backups/zerotrust-2025-01-01T00-00-00.dump"); return true; } catch { return false; } })()
  );
  assert(
    "valid zerotrust-<stamp>.dump.enc path is accepted",
    (() => { try { mod.assertSafeBackupPath("./backups/zerotrust-2025-01-01T00-00-00.dump.enc"); return true; } catch { return false; } })()
  );
  assert(
    "valid zerotrust-<stamp>.dump.enc.meta path is accepted",
    (() => { try { mod.assertSafeBackupPath("./backups/zerotrust-2025-01-01T00-00-00.dump.enc.meta"); return true; } catch { return false; } })()
  );
  assert(
    "non-backup filename is rejected",
    (() => { try { mod.assertSafeBackupPath("./backups/random.dump"); return false; } catch { return true; } })()
  );
  assert(
    "wrong-prefix filename is rejected",
    (() => { try { mod.assertSafeBackupPath("./backups/notzerotrust-x.dump"); return false; } catch { return true; } })()
  );
  assert(
    "absolute /etc/passwd is rejected",
    (() => { try { mod.assertSafeBackupPath("/etc/passwd"); return false; } catch { return true; } })()
  );
  assert(
    "metachar in path is rejected",
    (() => { try { mod.assertSafeBackupPath("./backups/zerotrust-x;rm.dump"); return false; } catch { return true; } })()
  );

  // Containment: with a backupDirResolved, escapes are rejected.
  assert(
    "path inside BACKUP_DIR is accepted (containment)",
    (() => { try { mod.assertSafeBackupPath("/var/lib/zerotrust/backups/zerotrust-2025-01-01T00-00-00.dump", "/var/lib/zerotrust/backups"); return true; } catch { return false; } })()
  );
  assert(
    "path that escapes BACKUP_DIR via ../ is rejected",
    (() => { try { mod.assertSafeBackupPath("/var/lib/zerotrust/backups/../etc/passwd", "/var/lib/zerotrust/backups"); return false; } catch { return true; } })()
  );
}

// 4. safeSpawnOptions pins shell:false.
{
  const opts = mod.safeSpawnOptions();
  assert(
    "safeSpawnOptions pins shell:false",
    opts.shell === false
  );
  assert(
    "safeSpawnOptions uses safe stdio (ignore,in,pipe)",
    Array.isArray(opts.stdio) && opts.stdio[0] === "ignore" && opts.stdio[2] === "pipe"
  );
}

console.log("\nAll CWE-78 smoke checks passed.\n");