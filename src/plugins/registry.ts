import type { LoadedPlugin } from "./types";

/** In-memory registry of plugins loaded during server boot. */
export class PluginRegistry {
  private readonly plugins = new Map<string, LoadedPlugin>();

  add(plugin: LoadedPlugin): void {
    this.plugins.set(plugin.manifest.id, plugin);
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  get(id: string): LoadedPlugin | undefined {
    return this.plugins.get(id);
  }

  list(): LoadedPlugin[] {
    return [...this.plugins.values()].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  }

  /** Public metadata safe to expose on `/api/plugins`. */
  toPublicJson(): Array<{
    id: string;
    name: string;
    version: string;
    description?: string;
    apiRoutes?: LoadedPlugin["manifest"]["apiRoutes"];
    ui?: LoadedPlugin["manifest"]["ui"];
  }> {
    return this.list().map(({ manifest }) => ({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      apiRoutes: manifest.apiRoutes,
      ui: manifest.ui,
    }));
  }
}

let globalRegistry: PluginRegistry | null = null;

export function setPluginRegistry(registry: PluginRegistry): void {
  globalRegistry = registry;
}

export function getPluginRegistry(): PluginRegistry | null {
  return globalRegistry;
}
