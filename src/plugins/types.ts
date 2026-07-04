import type { Hono } from "hono";
import type { getLogger } from "../logger";
import type { HonoEnv, zerotrustConfig } from "../shared/types";

/** Metadata exported by every plugin (see `manifest.ts` in each plugin folder). */
export interface PluginManifest {
  /** Stable directory name, e.g. `magic-link`. */
  id: string;
  /** Human-readable title for admin/docs. */
  name: string;
  /** Semver string for the plugin package. */
  version: string;
  description?: string;
  /** API route mounts this plugin owns (informational + docs). */
  apiRoutes?: Array<{ mountPath: string; description?: string }>;
  /** Optional env vars documented by the plugin. */
  env?: Array<{ key: string; required?: boolean; description?: string }>;
  /**
   * UI integration hints for the Next.js app (phased migration).
   * Pages under `packages/ui/src/app/` can read enabled plugins and conditionally
   * render nav items / routes — see `docs/plugins.md`.
   */
  ui?: {
    routes?: Array<{ path: string; label: string; group?: "auth" | "admin" | "dashboard" }>;
    navItems?: Array<{ href: string; label: string; adminOnly?: boolean }>;
  };
}

export interface PluginContext {
  app: Hono<HonoEnv>;
  config: zerotrustConfig;
  logger: ReturnType<typeof getLogger>;
}

/** Contract every plugin module must satisfy (`plugins/<id>/index.ts`). */
export interface ZerotrustPlugin {
  manifest: PluginManifest;
  register(ctx: PluginContext): void | Promise<void>;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  sourcePath: string;
}

export interface PluginLoadResult {
  loaded: LoadedPlugin[];
  skipped: string[];
  errors: Array<{ id: string; error: string }>;
}
