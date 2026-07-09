// Local helper to launch vitest from bun-managed node_modules on Windows.
// Uses Node's CommonJS loader with explicit module path setup so the bun
// install root is visible to vitest's transitive deps.

const { Module } = require("node:module");
const path = require("node:path");
const fs = require("node:fs");

const BUN_STORE = path.resolve(
  process.cwd(),
  "node_modules/.bun/vitest@4.1.8+6f5989a3143b575b/node_modules"
);

// Prepend every "package@version" directory under node_modules/.bun to the
// module search path so transitive deps resolve. Order: vitest's own node_modules
// first, then the rest.
const bunRoot = path.resolve(process.cwd(), "node_modules/.bun");
const searchRoots = [BUN_STORE];
for (const entry of fs.readdirSync(bunRoot)) {
  const candidate = path.join(bunRoot, entry, "node_modules");
  if (candidate === BUN_STORE) continue;
  if (fs.existsSync(candidate)) searchRoots.push(candidate);
}

Module.globalPaths.unshift(...searchRoots);

// Now load vitest. Its own node_modules contains vitest's transitive deps
// including @vitest/utils, but the require resolver needs them visible too.
const vitestEntry = path.join(BUN_STORE, "vitest/dist/node/chunks/bin.js");
if (!fs.existsSync(vitestEntry)) {
  // Fall back to direct CLI entry.
  const cli = path.join(BUN_STORE, "vitest/dist/cli.js");
  require(cli);
} else {
  require(vitestEntry);
}
