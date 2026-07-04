import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Absolute path to the repo-root `plugins/` directory. */
export function getPluginsRoot(cwd = process.cwd()): string {
  return join(cwd, "plugins");
}

/**
 * List plugin IDs by scanning `plugins/` for subdirectories containing `index.ts`.
 */
export function discoverPluginIds(cwd = process.cwd()): string[] {
  const root = getPluginsRoot(cwd);
  if (!existsSync(root)) return [];

  const entries = readdirSync(root, { withFileTypes: true });
  const ids: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;

    const indexTs = join(root, entry.name, "index.ts");
    if (existsSync(indexTs) && statSync(indexTs).isFile()) {
      ids.push(entry.name);
    }
  }

  return ids.sort();
}
