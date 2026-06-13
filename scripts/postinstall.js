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
  readFileSync,
  readdirSync,
  realpathSync,
} = require("fs");
const { join, dirname } = require("path");
const { homedir, tmpdir } = require("os");

const platform = process.platform; // 'linux' | 'darwin' | 'win32'
const arch = process.arch; // 'x64' | 'arm64'
const key = `${platform}-${arch}`;

const SUPPORTED = ["linux-x64", "darwin-x64", "darwin-arm64", "win32-x64"];
if (!SUPPORTED.includes(key)) process.exit(0);

const root = join(__dirname, "..");

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
    tmp = mkdtempSync(join(tmpdir(), "zeroauth-binding-"));
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
