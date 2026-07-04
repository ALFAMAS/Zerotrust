/**
 * Resolve which plugin IDs should be loaded at boot.
 *
 * - Default: every subdirectory of `plugins/` that contains `index.ts`
 * - `ENABLED_PLUGINS=id1,id2` — allowlist (when set, only listed plugins load)
 * - `DISABLED_PLUGINS=id1,id2` — denylist applied after discovery
 */

function parsePluginList(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function resolveEnabledPluginIds(
  discovered: string[],
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const disabled = parsePluginList(env.DISABLED_PLUGINS);
  const allowlist = parsePluginList(env.ENABLED_PLUGINS);

  let ids = discovered.filter((id) => !disabled.has(id));

  if (allowlist.size > 0) {
    ids = ids.filter((id) => allowlist.has(id));
  }

  return [...ids].sort();
}
