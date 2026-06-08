#!/usr/bin/env node
// Ensures platform-specific native bindings are discoverable after `bun install`.
// Bun caches optional native deps globally but doesn't always hoist them into
// node_modules where the consuming packages can find them via require().
// Handles: Linux x64, Windows x64, macOS x64, macOS arm64.

const { spawnSync } = require("child_process");
const { existsSync, copyFileSync, readFileSync, readdirSync, realpathSync } = require("fs");
const { join, dirname } = require("path");
const { homedir } = require("os");

const platform = process.platform; // 'linux' | 'darwin' | 'win32'
const arch = process.arch; // 'x64' | 'arm64'
const key = `${platform}-${arch}`;

const SUPPORTED = ["linux-x64", "darwin-x64", "darwin-arm64", "win32-x64"];
if (!SUPPORTED.includes(key)) process.exit(0);

const root = join(__dirname, "..");

// ── 1. @parcel/watcher native binding ────────────────────────────────────────
// Next.js 16 Turbopack requires @parcel/watcher; bun doesn't hoist its native
// binding into the packages/ui node_modules where @parcel/watcher can find it.
const parcelBindingName = {
  "linux-x64": "watcher-linux-x64-glibc",
  "darwin-x64": "watcher-darwin-x64",
  "darwin-arm64": "watcher-darwin-arm64",
  "win32-x64": "watcher-win32-x64",
}[key];

const uiDir = join(root, "packages", "ui");
const parcelDest = join(uiDir, "node_modules", "@parcel", parcelBindingName);
if (!existsSync(parcelDest)) {
  spawnSync(
    "npm",
    ["install", "--no-save", "--ignore-scripts", `@parcel/${parcelBindingName}@2.5.6`],
    { cwd: uiDir, stdio: "inherit", shell: true }
  );
}

// ── 2. @swc/core native binding ───────────────────────────────────────────────
// next-intl@4.13+ uses @swc/core; its .node binary must sit next to binding.js.
// Bun downloads the platform package but doesn't place it where @swc/core looks.
const swcPkgName = {
  "linux-x64": "@swc/core-linux-x64-gnu",
  "darwin-x64": "@swc/core-darwin-x64",
  "darwin-arm64": "@swc/core-darwin-arm64",
  // Windows: bun installs the binding correctly, no manual fix needed
}[key];

const swcBinaryName = {
  "linux-x64": "swc.linux-x64-gnu.node",
  "darwin-x64": "swc.darwin-x64.node",
  "darwin-arm64": "swc.darwin-arm64.node",
}[key];

if (swcPkgName && swcBinaryName) {
  let swcBindingDir = null;
  try {
    swcBindingDir = dirname(require.resolve("@swc/core/binding"));
  } catch {}

  if (swcBindingDir) {
    const dest = join(swcBindingDir, swcBinaryName);
    if (!existsSync(dest)) {
      // Try bun's global package cache first (fastest — no network)
      const pkgDirName = swcPkgName.replace("/", "+").replace("@", "");
      const bunCacheDir = join(homedir(), ".bun", "install", "cache", "@swc");
      let copied = false;

      if (existsSync(bunCacheDir)) {
        const shortName = swcPkgName.replace("@swc/", "");
        const match = readdirSync(bunCacheDir).find((d) => d.startsWith(`${shortName}@`));
        if (match) {
          const src = join(bunCacheDir, match, swcBinaryName);
          if (existsSync(src)) {
            copyFileSync(src, dest);
            console.log(`✓ ${swcBinaryName} placed from bun cache`);
            copied = true;
          }
        }
      }

      // Fallback: npm install the platform package next to @swc/core
      if (!copied) {
        const swcVersion = (() => {
          try {
            return JSON.parse(readFileSync(join(swcBindingDir, "..", "package.json"), "utf8")).version;
          } catch {
            return "1.15.40";
          }
        })();
        spawnSync(
          "npm",
          ["install", "--no-save", "--ignore-scripts", `${swcPkgName}@${swcVersion}`],
          { cwd: join(swcBindingDir, ".."), stdio: "inherit", shell: true }
        );
        // After npm install, the .node file should be resolvable — copy it over
        const installedBinary = join(swcBindingDir, "..", "node_modules", swcPkgName, swcBinaryName);
        if (existsSync(installedBinary)) {
          copyFileSync(installedBinary, dest);
          console.log(`✓ ${swcBinaryName} placed via npm install`);
        }
      }
    }
  }
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
