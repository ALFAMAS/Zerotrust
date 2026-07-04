import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Hono } from "hono";
import { getConfig } from "../config";
import { getLogger } from "../logger";
import type { HonoEnv } from "../shared/types";
import { resolveEnabledPluginIds } from "./config";
import { discoverPluginIds } from "./discover";
import { PluginRegistry, setPluginRegistry } from "./registry";
import type { PluginLoadResult, ZerotrustPlugin } from "./types";

const logger = getLogger("plugin-loader");

function resolvePluginEntryPath(id: string, cwd = process.cwd()): string | null {
  const prodJs = join(cwd, "dist", "plugins", id, "index.js");
  if (existsSync(prodJs)) return prodJs;

  const devTs = join(cwd, "plugins", id, "index.ts");
  if (existsSync(devTs)) return devTs;

  return null;
}

async function importPluginModule(id: string, cwd = process.cwd()): Promise<ZerotrustPlugin> {
  const entry = resolvePluginEntryPath(id, cwd);
  if (!entry) {
    throw new Error(`Plugin entry not found for "${id}"`);
  }

  const mod = await import(pathToFileURL(entry).href);
  const plugin: ZerotrustPlugin | undefined = mod.default ?? mod.plugin;
  if (!plugin?.manifest?.id || typeof plugin.register !== "function") {
    throw new Error(
      `Plugin "${id}" must default-export a ZerotrustPlugin with manifest + register()`
    );
  }
  if (plugin.manifest.id !== id) {
    throw new Error(
      `Plugin folder "${id}" manifest.id mismatch: expected "${id}", got "${plugin.manifest.id}"`
    );
  }
  return plugin;
}

export interface LoadPluginsOptions {
  cwd?: string;
  /** When true, the first plugin load error aborts boot. Default: true in production. */
  failFast?: boolean;
}

/**
 * Discover, filter, and register all enabled plugins on the Hono app.
 */
export async function loadPlugins(
  app: Hono<HonoEnv>,
  opts: LoadPluginsOptions = {}
): Promise<PluginLoadResult> {
  const cwd = opts.cwd ?? process.cwd();
  const failFast = opts.failFast ?? process.env.NODE_ENV === "production";

  const discovered = discoverPluginIds(cwd);
  const enabled = resolveEnabledPluginIds(discovered, process.env);
  const skipped = discovered.filter((id) => !enabled.includes(id));

  const registry = new PluginRegistry();
  const result: PluginLoadResult = { loaded: [], skipped, errors: [] };

  if (skipped.length > 0) {
    logger.info("Plugins skipped by configuration", { skipped });
  }

  const config = getConfig();

  for (const id of enabled) {
    try {
      const plugin = await importPluginModule(id, cwd);
      await plugin.register({ app, config, logger: getLogger(`plugin:${id}`) });
      const entry = resolvePluginEntryPath(id, cwd) ?? "";
      const loaded = { manifest: plugin.manifest, sourcePath: entry };
      registry.add(loaded);
      result.loaded.push(loaded);
      logger.info("Plugin loaded", { id: plugin.manifest.id, version: plugin.manifest.version });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ id, error: message });
      logger.error(`Failed to load plugin "${id}"`, err as Error);
      if (failFast) {
        throw new Error(`Plugin boot failed for "${id}": ${message}`);
      }
    }
  }

  setPluginRegistry(registry);
  return result;
}

export { discoverPluginIds, resolveEnabledPluginIds };
