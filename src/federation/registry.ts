import type { FederatedProvider } from "./types.js";

const providers = new Map<string, FederatedProvider>();

export function registerProvider(p: Omit<FederatedProvider, "createdAt">): FederatedProvider {
  const provider: FederatedProvider = { ...p, createdAt: new Date() };
  providers.set(p.id, provider);
  return provider;
}

export function getProvider(id: string): FederatedProvider | null {
  return providers.get(id) ?? null;
}

export function listProviders(): FederatedProvider[] {
  return [...providers.values()];
}

export function removeProvider(id: string): boolean {
  return providers.delete(id);
}

export function initFederationFromEnv(): void {
  const raw = process.env.FEDERATION_PROVIDERS;
  if (!raw) return;
  try {
    const list = JSON.parse(raw) as Array<Omit<FederatedProvider, "createdAt">>;
    for (const entry of list) {
      const { enabled, ...rest } = entry;
      registerProvider({ enabled: enabled ?? true, ...rest });
    }
  } catch {
    // malformed env var — silently skip
  }
}
