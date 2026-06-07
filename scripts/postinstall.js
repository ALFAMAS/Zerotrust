#!/usr/bin/env node
// Ensures platform-specific native bindings are discoverable after `bun install`.
// Bun caches optional native deps globally but doesn't always hoist them into
// node_modules where the consuming packages can find them via require().
// This script fills that gap on Linux x64.

const { spawnSync } = require("child_process");
const { existsSync, copyFileSync, mkdirSync } = require("fs");
const { join, dirname } = require("path");
const { homedir } = require("os");

if (process.platform !== "linux" || process.arch !== "x64") process.exit(0);

const root = join(__dirname, "..");

// ── 1. @parcel/watcher-linux-x64-glibc ──────────────────────────────────────
// Next.js 16 requires @parcel/watcher; bun doesn't hoist its native binding.
// npm install places it in packages/ui/node_modules where watcher can find it.
const uiDir = join(root, "packages", "ui");
const parcelDest = join(uiDir, "node_modules", "@parcel", "watcher-linux-x64-glibc");
if (!existsSync(parcelDest)) {
  spawnSync(
    "npm",
    ["install", "--no-save", "--ignore-scripts", "@parcel/watcher-linux-x64-glibc@2.5.6"],
    { cwd: uiDir, stdio: "inherit", shell: true }
  );
}

// ── 2. @swc/core native binding ──────────────────────────────────────────────
// next-intl@4.13+ requires @swc/core; its .node binary must sit next to binding.js.
// Bun downloads it to the global cache but doesn't place it where @swc/core looks.
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
    // Try bun's global cache (format: ~/.bun/install/cache/@swc/core-linux-x64-gnu@VER@@@HASH/)
    const cacheBase = join(homedir(), ".bun", "install", "cache", "@swc");
    if (existsSync(cacheBase)) {
      const { readdirSync } = require("fs");
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
