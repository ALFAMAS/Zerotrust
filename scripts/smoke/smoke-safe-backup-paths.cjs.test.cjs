// Smoke test for scripts/safe-backup-paths.cjs. Mirrors the assertions in
// scripts/smoke-dbbackup-cwe78.mjs so the CLI scripts can't drift from the
// canonical TS source.

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`  ok  ${label}`);
}

console.log("\n== scripts/safe-backup-paths.cjs (CLI mirror) ==");

const mod = require("./safe-backup-paths.cjs");
assert(
  "assertSafeCommand accepts pg_dump",
  (() => {
    try {
      mod.assertSafeCommand("pg_dump");
      return true;
    } catch {
      return false;
    }
  })()
);
assert(
  "assertSafeCommand accepts pg_restore",
  (() => {
    try {
      mod.assertSafeCommand("pg_restore");
      return true;
    } catch {
      return false;
    }
  })()
);
assert(
  "assertSafeCommand accepts psql",
  (() => {
    try {
      mod.assertSafeCommand("psql");
      return true;
    } catch {
      return false;
    }
  })()
);
assert(
  "assertSafeCommand rejects bash",
  (() => {
    try {
      mod.assertSafeCommand("bash");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "assertSafeCommand rejects sh",
  (() => {
    try {
      mod.assertSafeCommand("sh");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "assertSafeCommand rejects /usr/bin/rm",
  (() => {
    try {
      mod.assertSafeCommand("/usr/bin/rm");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "assertSafeCommand rejects empty",
  (() => {
    try {
      mod.assertSafeCommand("");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "BACKUP_DIR with `;` is rejected",
  (() => {
    try {
      mod.assertSafeBackupDir("/tmp/innocent;rm -rf /");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "BACKUP_DIR with `&&` is rejected",
  (() => {
    try {
      mod.assertSafeBackupDir("/tmp/x && curl evil");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "BACKUP_DIR with backtick is rejected",
  (() => {
    try {
      mod.assertSafeBackupDir("/tmp/`whoami`");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "BACKUP_DIR with .. traversal is rejected",
  (() => {
    try {
      mod.assertSafeBackupDir("/tmp/legit/../../etc");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "BACKUP_DIR with newline is rejected",
  (() => {
    try {
      mod.assertSafeBackupDir("/tmp/x\nrm");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "BACKUP_DIR with NUL byte is rejected",
  (() => {
    try {
      mod.assertSafeBackupDir("/tmp/x\0");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "clean absolute BACKUP_DIR is accepted",
  (() => {
    try {
      mod.assertSafeBackupDir("/var/lib/zerotrust/backups");
      return true;
    } catch {
      return false;
    }
  })()
);
assert(
  "clean relative BACKUP_DIR is accepted",
  (() => {
    try {
      mod.assertSafeBackupDir("./backups");
      return true;
    } catch {
      return false;
    }
  })()
);
assert(
  "empty BACKUP_DIR is rejected",
  (() => {
    try {
      mod.assertSafeBackupDir("");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "valid zerotrust-<stamp>.dump path is accepted",
  (() => {
    try {
      mod.assertSafeBackupPath("./backups/zerotrust-2025-01-01T00-00-00.dump");
      return true;
    } catch {
      return false;
    }
  })()
);
assert(
  "valid zerotrust-<stamp>.dump.enc path is accepted",
  (() => {
    try {
      mod.assertSafeBackupPath("./backups/zerotrust-2025-01-01T00-00-00.dump.enc");
      return true;
    } catch {
      return false;
    }
  })()
);
assert(
  "valid zerotrust-<stamp>.dump.enc.meta path is accepted",
  (() => {
    try {
      mod.assertSafeBackupPath("./backups/zerotrust-2025-01-01T00-00-00.dump.enc.meta");
      return true;
    } catch {
      return false;
    }
  })()
);
assert(
  "non-backup filename is rejected",
  (() => {
    try {
      mod.assertSafeBackupPath("./backups/random.dump");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "wrong-prefix filename is rejected",
  (() => {
    try {
      mod.assertSafeBackupPath("./backups/notzerotrust-x.dump");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "absolute /etc/passwd is rejected",
  (() => {
    try {
      mod.assertSafeBackupPath("/etc/passwd");
      return false;
    } catch {
      return true;
    }
  })()
);
assert(
  "metachar in path is rejected",
  (() => {
    try {
      mod.assertSafeBackupPath("./backups/zerotrust-x;rm.dump");
      return false;
    } catch {
      return true;
    }
  })()
);

// 4. safeSpawnOptions pins shell:false and accepts stdio override.
{
  const optsDefault = mod.safeSpawnOptions();
  assert("safeSpawnOptions pins shell:false (default)", optsDefault.shell === false);
  assert(
    "safeSpawnOptions default stdio is [ignore, ignore, pipe]",
    Array.isArray(optsDefault.stdio) &&
      optsDefault.stdio[0] === "ignore" &&
      optsDefault.stdio[2] === "pipe"
  );

  const optsInherit = mod.safeSpawnOptions({ stdio: ["ignore", "inherit", "inherit"] });
  assert(
    "safeSpawnOptions accepts stdio override",
    optsInherit.stdio[1] === "inherit" &&
      optsInherit.stdio[2] === "inherit" &&
      optsInherit.shell === false
  );

  const optsEnv = mod.safeSpawnOptions({ env: { FOO: "bar" } });
  assert(
    "safeSpawnOptions merges env override",
    optsEnv.env.FOO === "bar" && optsEnv.shell === false
  );
}

console.log("\nAll CLI mirror smoke checks passed.\n");
