#!/usr/bin/env node
// Ensures platform-specific native bindings are discoverable after `bun install`.
// Bun caches optional native deps globally but doesn't always hoist them into
// node_modules where the consuming packages can find them via require().
// This script fills that gap on Linux x64 and Windows x64.

const { spawnSync } = require("child_process");
const { existsSync, copyFileSync, readFileSync, readdirSync, realpathSync } = require("fs");
const { join, dirname } = require("path");
const { homedir } = require("os");

const isLinuxX64 = process.platform === "linux" && process.arch === "x64";
const isWinX64 = process.platform === "win32" && process.arch === "x64";

if (!isLinuxX64 && !isWinX64) process.exit(0);

const root = join(__dirname, "..");

// ── 1. @parcel/watcher native binding ────────────────────────────────────────
// Next.js 16 requires @parcel/watcher; bun doesn't hoist its native binding.
// npm install places it in packages/ui/node_modules where watcher can find it.
const uiDir = join(root, "packages", "ui");
const parcelPkg = isLinuxX64
  ? "@parcel/watcher-linux-x64-glibc@2.5.6"
  : "@parcel/watcher-win32-x64@2.5.6";
const parcelName = isLinuxX64 ? "watcher-linux-x64-glibc" : "watcher-win32-x64";
const parcelDest = join(uiDir, "node_modules", "@parcel", parcelName);
if (!existsSync(parcelDest)) {
  spawnSync("npm", ["install", "--no-save", "--ignore-scripts", parcelPkg], {
    cwd: uiDir,
    stdio: "inherit",
    shell: true,
  });
}

// ── 2. @swc/core native binding (Linux only) ──────────────────────────────────
// next-intl@4.13+ requires @swc/core; its .node binary must sit next to binding.js.
// Bun downloads it to the global cache but doesn't place it where @swc/core looks.
if (isLinuxX64) {
  function findSwcCoreDir() {
    try {
      return dirname(require.resolve("@swc/core/binding"));
    } catch {
      return null;
    }
  }

  const swcDir = findSwcCoreDir();
  if (swcDir) {
    const dest = join(swcDir, "swc.linux-x64-gnu.node");
    if (!existsSync(dest)) {
      const cacheBase = join(homedir(), ".bun", "install", "cache", "@swc");
      if (existsSync(cacheBase)) {
        const match = readdirSync(cacheBase).find((d) =>
          d.startsWith("core-linux-x64-gnu@")
        );
        if (match) {
          const src = join(cacheBase, match, "swc.linux-x64-gnu.node");
          if (existsSync(src)) {
            copyFileSync(src, dest);
            console.log("✓ @swc/core linux binding placed");
          }
        }
      }
    }
  }
}

// ── 3. @esbuild platform binding for drizzle-kit's bundled esbuild ───────────
// bun installs drizzle-kit with a nested esbuild whose minor version may differ
// from the top-level platform binding installed for vite/vitest.
// The esbuild service refuses to start when the JS host and native binary
// versions don't match. Fix: install the matching binary into esbuild's own
// bun bundle directory so it is found before the top-level binary.
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
if (esbuildInfo) {
  const { version, esbuildDir } = esbuildInfo;
  const bindingName = isLinuxX64 ? "linux-x64" : "win32-x64";
  const binaryDest = join(esbuildDir, "..", "@esbuild", bindingName);
  if (!existsSync(binaryDest)) {
    const pkg = isLinuxX64
      ? `@esbuild/linux-x64@${version}`
      : `@esbuild/win32-x64@${version}`;
    spawnSync("npm", ["install", "--no-save", "--ignore-scripts", pkg], {
      cwd: dirname(esbuildDir),
      stdio: "inherit",
      shell: true,
    });
    if (existsSync(binaryDest)) {
      console.log(`✓ @esbuild/${bindingName}@${version} placed for drizzle-kit`);
    }
  }
}
