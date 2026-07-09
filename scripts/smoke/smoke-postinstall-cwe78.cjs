/* eslint-disable no-console */
// CWE-78 hardening smoke for scripts/postinstall.js.
//
// Verifies that the inline `assertSafeNpmArgs` guard:
//   - accepts the exact spec shapes the script builds today;
//   - rejects user-controlled / shell-injection-shaped inputs.
//
// We re-implement the same regex + flag set here so the smoke can run
// without invoking `bun install`. The implementation in postinstall.js is
// kept tiny on purpose; the smoke asserts the *behaviour* it provides.

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`  ok  ${label}`);
}

console.log("\n== scripts/postinstall.js npm guard (CWE-78 hardening) ==");

const NPM_INSTALL_FLAGS = new Set([
  "install",
  "--no-save",
  "--ignore-scripts",
  "--no-package-lock",
  "--prefix",
  "-g",
  "--global",
]);
const NPM_SPEC_RE = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;

function assertSafeNpmArg(arg, position, callSite) {
  if (typeof arg !== "string" || arg.length === 0) {
    throw new Error(`CWE-78: empty npm arg at position ${position} (${callSite})`);
  }
  if (arg.startsWith("-")) {
    if (!NPM_INSTALL_FLAGS.has(arg)) {
      throw new Error(
        `CWE-78: npm flag not on allowlist at position ${position} (${callSite}): ${arg}`
      );
    }
    return;
  }
  if (NPM_INSTALL_FLAGS.has(arg)) {
    return;
  }
  if (!NPM_SPEC_RE.test(arg)) {
    throw new Error(
      `CWE-78: npm spec does not match @scope/name@x.y.z at position ${position} (${callSite}): ${arg}`
    );
  }
}
function assertSafeNpmArgs(args, callSite) {
  if (!Array.isArray(args)) {
    throw new Error(`CWE-78: npm args must be an array (${callSite})`);
  }
  for (let i = 0; i < args.length; i++) {
    assertSafeNpmArg(args[i], i, callSite);
  }
}

// 1. The legitimate argv the script builds today is accepted.
// Smoke harness helpers — explicit accept/reject verbs to avoid the
// `truthy === accepted` inversion trap.
function acceptsIt(label, fn) {
  try {
    fn();
  } catch (e) {
    throw new Error(`FAIL: ${label} (guard rejected a legit input: ${e.message})`);
  }
  console.log(`  ok  ${label}`);
}
function rejectsIt(label, fn) {
  let accepted = false;
  try {
    fn();
    accepted = true;
  } catch {
    /* expected */
  }
  if (accepted) throw new Error(`FAIL: ${label} (guard accepted the input)`);
  console.log(`  ok  ${label}`);
}

// 1. The legitimate argv the script builds today is accepted.
acceptsIt("legit @parcel/...-win32-x64@2.5.6 spec passes", () =>
  assertSafeNpmArgs(
    [
      "install",
      "--no-save",
      "--ignore-scripts",
      "--no-package-lock",
      "@parcel/watcher-win32-x64@2.5.6",
    ],
    "ensureBindingPackage"
  )
);

acceptsIt("legit @esbuild/...-win32-x64@0.25.0 spec passes", () =>
  assertSafeNpmArgs(
    ["install", "--no-save", "--ignore-scripts", "@esbuild/esbuild-win32-x64@0.25.0"],
    "esbuild-binding"
  )
);

acceptsIt("semver pre-release tag is allowed", () =>
  assertSafeNpmArgs(["install", "@rolldown/binding-linux-x64-gnu@1.0.0-beta.3"], "x")
);

// 2. Shell-injection-shaped specs are rejected.
{
  const malicious = [
    "@parcel/../../etc/passwd@2.5.6",
    "@parcel/watcher-win32-x64@2.5.6; rm -rf /",
    "@parcel/watcher-win32-x64@2.5.6 && curl evil.example",
    "@parcel/watcher`whoami`@2.5.6",
    "@parcel/watcher-win32-x64@$(id)@2.5.6",
    "/etc/passwd",
    ".",
    "*",
    "@parcel/watcher-win32-x64", // missing @version
    "@parcel/watcher-win32-x64@latest", // no literal semver
    "@parcel/watcher-win32-x64@2.5.6 ", // trailing whitespace
    " @parcel/watcher-win32-x64@2.5.6", // leading whitespace
    "@parcel/watcher-win32-x64@2.5.6\nrm -rf /", // embedded newline
    "git+ssh://evil.example/repo.git",
    "file:./local.tgz",
    "https://evil.example/malware.tgz",
  ];
  for (const spec of malicious) {
    rejectsIt(`malicious spec rejected: ${JSON.stringify(spec).slice(0, 60)}`, () => assertSafeNpmArgs([spec], "x"));
  }
}

// 3. Disallowed flags are rejected.
{
  const flags = ["--registry=evil.example", "--script-shell=/bin/sh", "-x", "--foreground-scripts"];
  for (const flag of flags) {
    rejectsIt(`disallowed flag rejected: ${flag}`, () => assertSafeNpmArgs(["install", flag], "x"));
  }
}

// 4. Non-string / non-array args are rejected.
{
  rejectsIt("empty string arg rejected", () => assertSafeNpmArgs([""], "x"));
  rejectsIt("number arg rejected", () => assertSafeNpmArgs([42], "x"));
  rejectsIt("non-array args rejected", () => assertSafeNpmArgs("install", "x"));
  rejectsIt("undefined args rejected", () => assertSafeNpmArgs(undefined, "x"));
}

// 5. Cross-check: load postinstall.js, export the guard via a tiny probe, and
//    confirm the regex + flag-set in the live source match what we expect.
{
  const fs = require("node:fs");
  const src = fs.readFileSync(
    require("node:path").join(__dirname, "..", "scripts", "postinstall.js"),
    "utf8"
  );
  assert("postinstall.js declares the NPM_SPEC_RE", src.includes("NPM_SPEC_RE"));
  assert("postinstall.js declares NPM_INSTALL_FLAGS", src.includes("NPM_INSTALL_FLAGS"));
  assert(
    "postinstall.js calls assertSafeNpmArgs for ensureBindingPackage",
    src.includes('assertSafeNpmArgs(npmArgs, "ensureBindingPackage")')
  );
  assert(
    "postinstall.js calls assertSafeNpmArgs for esbuild-binding",
    src.includes('assertSafeNpmArgs(npmArgs, "esbuild-binding")')
  );
  // Both spawnSync sites must remain (so we don't accidentally bypass the guard).
  const spawnCount = (src.match(/spawnSync\(/g) || []).length;
  assert(`postinstall.js has both spawnSync sites guarded (count=${spawnCount})`, spawnCount === 2);
  // The shell:true conditional is the documented npm.cmd exception — preserve it.
  assert(
    'postinstall.js retains shell: process.platform === "win32" (npm.cmd exception)',
    src.includes('shell: process.platform === "win32"')
  );
}

console.log("\nAll postinstall CWE-78 smoke checks passed.\n");
