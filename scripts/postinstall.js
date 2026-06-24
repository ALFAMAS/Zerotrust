#!/usr/bin/env node
// Ensures platform-specific native bindings are discoverable after `bun install`.
// Bun caches optional native deps globally but doesn't always hoist them into
// node_modules where the consuming packages can find them via require().
// Handles: Linux x64, Windows x64, macOS x64, macOS arm64.

const { spawnSync } = require("child_process");
const {
  existsSync,
  cpSync,
  mkdtempSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} = require("fs");
const { join, dirname } = require("path");
const { homedir, tmpdir } = require("os");

const platform = process.platform; // 'linux' | 'darwin' | 'win32'
const arch = process.arch; // 'x64' | 'arm64'
const key = `${platform}-${arch}`;

const root = join(__dirname, "..");

// ── 0. Repair dead junctions left by bun on Windows ──────────────────────────
// On Windows, bun links each dependency from its isolated store
// (node_modules/.bun/<pkg>@<ver>+<hash>/node_modules/<pkg>) into the consuming
// node_modules via a directory junction. A flaky `bun install` / `bun add` can
// leave those junctions as dead reparse points: the target is gone but the link
// remains, so Node throws "Cannot find module ..." / "Cannot find package ..."
// even though the package still sits in .bun. git-bash `ls` follows the junction
// so it looks fine, which makes this hard to spot. Detect every dead junction in
// the repo's node_modules trees and relink it to its store directory. The .bun
// store itself stays intact, so this is non-destructive — we only ever recreate
// the link, never touch package contents, and skip any link we can't resolve.
function repairWindowsJunctions() {
  if (platform !== "win32") return;
  const bunStore = join(root, "node_modules", ".bun");
  if (!existsSync(bunStore)) return;

  const storeEntries = readdirSync(bunStore, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const verOf = (entry, prefix) => entry.slice(prefix.length).split("+")[0];
  const semverMax = (a, b) => {
    const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
    const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? a : b;
    }
    return a;
  };

  // Authoritative root-hoisted version for an ambiguous name, read from the
  // bare-name key in bun.lock: `"<name>": ["<name>@<ver>", ...]`.
  let lockText = "";
  try {
    lockText = readFileSync(join(root, "bun.lock"), "utf8");
  } catch {
    /* no lockfile — fall back to highest semver below */
  }
  const lockVersion = (name) => {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = lockText.match(new RegExp(`"${esc}":\\s*\\["${esc}@([^"+]+)`));
    return m ? m[1] : null;
  };

  // Resolve the store package dir that a link named `name` should point to.
  const storeTargetFor = (name) => {
    const prefix = name.replace(/\//g, "+") + "@";
    const sub = name.split("/");
    const cands = storeEntries
      .filter((d) => d.startsWith(prefix))
      .map((d) => ({
        ver: verOf(d, prefix),
        dir: join(bunStore, d, "node_modules", ...sub),
      }))
      .filter((c) => existsSync(join(c.dir, "package.json")));
    if (cands.length === 0) return null;
    if (cands.length === 1) return cands[0].dir;
    const want = lockVersion(name);
    const filtered = want ? cands.filter((c) => c.ver === want) : cands;
    const pool = filtered.length ? filtered : cands;
    // Prefer the highest semver; same-version/different-hash variants are
    // interchangeable peer-dep contexts, so any is fine — take the first.
    const best = pool.reduce((a, b) => (semverMax(a.ver, b.ver) === a.ver ? a : b));
    return best.dir;
  };

  const isDeadJunction = (p) => {
    let st;
    try {
      st = lstatSync(p);
    } catch {
      return false;
    }
    if (!st.isSymbolicLink()) return false; // junctions report as symlinks
    return !existsSync(join(p, "package.json")); // existsSync follows → false if dead
  };

  const relink = (link, name, fixed) => {
    const target = storeTargetFor(name);
    if (!target) return; // can't resolve — leave it alone rather than break things
    try {
      rmdirSync(link); // removes the reparse point only, not the store contents
    } catch {
      try {
        rmSync(link, { force: true });
      } catch {
        return;
      }
    }
    try {
      symlinkSync(target, link, "junction");
      fixed.push(name);
    } catch (err) {
      console.warn(`⚠ could not relink ${name}: ${err && err.message}`);
    }
  };

  // node_modules roots to scan: repo root + every workspace package.
  const roots = [join(root, "node_modules")];
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    for (const glob of pkg.workspaces || []) {
      const baseRel = glob.replace(/\/\*$/, "");
      const baseDir = join(root, baseRel);
      if (glob.endsWith("/*") && existsSync(baseDir)) {
        for (const ws of readdirSync(baseDir)) {
          roots.push(join(baseDir, ws, "node_modules"));
        }
      } else if (existsSync(baseDir)) {
        roots.push(join(baseDir, "node_modules"));
      }
    }
  } catch {
    /* fall back to root-only scan */
  }

  const fixed = [];
  for (const nm of roots) {
    if (!existsSync(nm)) continue;
    for (const entry of readdirSync(nm)) {
      if (entry === ".bin" || entry === ".bun" || entry === ".cache") continue;
      const p = join(nm, entry);
      if (entry.startsWith("@")) {
        // scope dir is a real folder of per-package junctions — descend one level
        let kids;
        try {
          kids = readdirSync(p);
        } catch {
          continue;
        }
        for (const kid of kids) {
          const kp = join(p, kid);
          if (isDeadJunction(kp)) relink(kp, `${entry}/${kid}`, fixed);
        }
      } else if (isDeadJunction(p)) {
        relink(p, entry, fixed);
      }
    }
  }

  if (fixed.length) {
    console.log(`✓ repaired ${fixed.length} dead bun junction(s): ${fixed.join(", ")}`);
  }
}

repairWindowsJunctions();

const SUPPORTED = ["linux-x64", "darwin-x64", "darwin-arm64", "win32-x64"];
if (!SUPPORTED.includes(key)) process.exit(0);

// Locate a package directory inside bun's isolated install store
// (node_modules/.bun/<pkg>@<version>/node_modules/<subpath...>). Bun keeps
// transitive deps here rather than hoisting them to a node_modules root, so a
// plain require.resolve() from the repo root can't find them.
function bunStorePkgDir(entryPrefix, ...subpath) {
  const bunStore = join(root, "node_modules", ".bun");
  if (!existsSync(bunStore)) return null;
  const entry = readdirSync(bunStore).find((d) => d.startsWith(entryPrefix));
  if (!entry) return null;
  const dir = join(bunStore, entry, "node_modules", ...subpath);
  return existsSync(dir) ? dir : null;
}

// Ensure a platform-specific binding *package* exists at destPkgDir.
// 1. Copy the whole package from bun's global cache when present (no network).
// 2. Otherwise fetch it with npm into a pristine temp dir and copy it over.
//    The temp dir avoids the npm optional-dependencies bug (npm/cli#4828) that
//    makes `npm install` throw when run inside a workspace package directory.
// Always best-effort — never aborts the install.
function ensureBindingPackage(fullName, destPkgDir, version) {
  if (existsSync(destPkgDir)) return;

  const slash = fullName.indexOf("/");
  const scope = slash === -1 ? null : fullName.slice(0, slash); // e.g. "@parcel"
  const short = slash === -1 ? fullName : fullName.slice(slash + 1);

  // 1. Copy from bun's global package cache, if bun happened to download it.
  const cacheScopeDir = scope
    ? join(homedir(), ".bun", "install", "cache", scope)
    : join(homedir(), ".bun", "install", "cache");
  if (existsSync(cacheScopeDir)) {
    const match = readdirSync(cacheScopeDir).find(
      (d) => d === short || d.startsWith(`${short}@`)
    );
    if (match) {
      try {
        cpSync(join(cacheScopeDir, match), destPkgDir, { recursive: true });
        console.log(`✓ ${fullName} placed from bun cache`);
        return;
      } catch {
        // fall through to npm
      }
    }
  }

  // 2. Fetch via npm into a clean temp dir, then copy into place.
  let tmp;
  try {
    tmp = mkdtempSync(join(tmpdir(), "zerotrust-binding-"));
    const spec = version ? `${fullName}@${version}` : fullName;
    spawnSync(
      "npm",
      ["install", "--no-save", "--ignore-scripts", "--no-package-lock", "--prefix", tmp, spec],
      { cwd: tmp, stdio: "inherit", shell: true }
    );
    const installed = join(tmp, "node_modules", ...fullName.split("/"));
    if (existsSync(installed)) {
      cpSync(installed, destPkgDir, { recursive: true });
      console.log(`✓ ${fullName} placed via npm`);
    } else {
      console.warn(`⚠ ${fullName} could not be fetched`);
    }
  } catch (err) {
    console.warn(`⚠ could not place ${fullName}: ${err && err.message}`);
  } finally {
    if (tmp) {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* ignore temp cleanup failures */
      }
    }
  }
}

// ── 1. @parcel/watcher native binding ────────────────────────────────────────
// Next.js 16 Turbopack requires @parcel/watcher, which at runtime does
// require('@parcel/watcher-<platform>'). Bun installs @parcel/watcher into its
// isolated store but doesn't place that optional platform package next to it,
// so the binding must be dropped in as a sibling of @parcel/watcher.
const parcelBindingName = {
  "linux-x64": "watcher-linux-x64-glibc",
  "darwin-x64": "watcher-darwin-x64",
  "darwin-arm64": "watcher-darwin-arm64",
  "win32-x64": "watcher-win32-x64",
}[key];

const parcelWatcherDir =
  bunStorePkgDir("@parcel+watcher@", "@parcel", "watcher") ||
  (() => {
    try {
      return dirname(require.resolve("@parcel/watcher/package.json"));
    } catch {
      return null;
    }
  })();

if (parcelBindingName && parcelWatcherDir) {
  // Place as a sibling: <store>/@parcel/watcher-<platform>
  const parcelDest = join(dirname(parcelWatcherDir), parcelBindingName);
  ensureBindingPackage(`@parcel/${parcelBindingName}`, parcelDest, "2.5.6");
}

// ── 2. @swc/core native binding ───────────────────────────────────────────────
// next-intl@4.13+ uses @swc/core, whose binding.js does
// require('@swc/core-<platform>'). Bun installs @swc/core into its isolated
// store without that optional platform package, so drop it in as a sibling.
const swcPlatformName = {
  "linux-x64": "core-linux-x64-gnu",
  "darwin-x64": "core-darwin-x64",
  "darwin-arm64": "core-darwin-arm64",
  // Windows: bun installs the binding correctly, no manual fix needed
}[key];

const swcCoreDir =
  bunStorePkgDir("@swc+core@", "@swc", "core") ||
  (() => {
    try {
      return dirname(require.resolve("@swc/core/package.json"));
    } catch {
      return null;
    }
  })();

if (swcPlatformName && swcCoreDir) {
  let swcVersion;
  try {
    swcVersion = JSON.parse(readFileSync(join(swcCoreDir, "package.json"), "utf8")).version;
  } catch {
    swcVersion = undefined;
  }
  // Place as a sibling: <store>/@swc/core-<platform>
  const dest = join(dirname(swcCoreDir), swcPlatformName);
  ensureBindingPackage(`@swc/${swcPlatformName}`, dest, swcVersion);
}

// ── 3. @esbuild platform binding for drizzle-kit's bundled esbuild ───────────
// bun installs drizzle-kit with a nested esbuild whose minor version may differ
// from the top-level platform binding installed for vite/vitest.
// The esbuild service refuses to start when the JS host and native binary
// versions don't match. Install the matching binary into esbuild's own bun
// bundle directory so it is found before the top-level binary.
const esbuildBindingName = {
  "linux-x64": "linux-x64",
  "darwin-x64": "darwin-x64",
  "darwin-arm64": "darwin-arm64",
  "win32-x64": "win32-x64",
}[key];

function findBunEsbuildBundleDir() {
  try {
    const dkDir = dirname(require.resolve("drizzle-kit"));
    const esbuildPkg = join(dkDir, "..", "esbuild", "package.json");
    if (!existsSync(esbuildPkg)) return null;
    const { version } = JSON.parse(readFileSync(esbuildPkg, "utf8"));
    const esbuildDir = realpathSync(join(dkDir, "..", "esbuild"));
    return { version, esbuildDir };
  } catch {
    return null;
  }
}

const esbuildInfo = findBunEsbuildBundleDir();
if (esbuildInfo && esbuildBindingName) {
  const { version, esbuildDir } = esbuildInfo;
  const binaryDest = join(esbuildDir, "..", "@esbuild", esbuildBindingName);
  if (!existsSync(binaryDest)) {
    spawnSync(
      "npm",
      ["install", "--no-save", "--ignore-scripts", `@esbuild/${esbuildBindingName}@${version}`],
      { cwd: dirname(esbuildDir), stdio: "inherit", shell: true }
    );
    if (existsSync(binaryDest)) {
      console.log(`✓ @esbuild/${esbuildBindingName}@${version} placed for drizzle-kit`);
    }
  }
}

// ── 4. @rolldown/binding native binding (vitest 4) ───────────────────────────
// vitest 4 is built on rolldown, which requires a platform-specific
// @rolldown/binding-* package. Bun caches it but doesn't hoist it next to
// rolldown, so `require('@rolldown/binding-...')` fails at vitest startup.
const rolldownBindingName = {
  "linux-x64": "binding-linux-x64-gnu",
  "darwin-x64": "binding-darwin-x64",
  "darwin-arm64": "binding-darwin-arm64",
  "win32-x64": "binding-win32-x64-msvc",
}[key];

const rolldownDir =
  bunStorePkgDir("rolldown@", "rolldown") ||
  (() => {
    try {
      return dirname(require.resolve("rolldown/package.json"));
    } catch {
      return null;
    }
  })();

if (rolldownBindingName && rolldownDir) {
  try {
    const rolldownVersion = JSON.parse(
      readFileSync(join(rolldownDir, "package.json"), "utf8")
    ).version;
    const fullName = `@rolldown/${rolldownBindingName}`;
    // rolldown resolves the binding walking up from its own dir, so its own
    // node_modules/@rolldown is the canonical place to drop it.
    const dest = join(rolldownDir, "node_modules", "@rolldown", rolldownBindingName);
    ensureBindingPackage(fullName, dest, rolldownVersion);
  } catch {
    // rolldown not installed (e.g. production install) — nothing to do.
  }
}
