/**
 * Tenant model — in-memory store (no database table yet).
 * Replaces the previous Mongoose model.
 */

import crypto from "crypto";

export interface TenantSettings {
  allowedDomains: string[];
  enforceSSO: boolean;
  mfaRequired: boolean;
  sessionTTL: number;
  maxUsers: number;
  allowedCountries: string[];
  customBrandingUrl?: string;
}

export interface OidcConfig {
  enabled: boolean;
  clientId: string;
  redirectUris: string[];
  scopes: string[];
}

export interface SamlConfig {
  enabled: boolean;
  idpEntityId: string;
  idpSsoUrl: string;
  idpCert: string;
  spEntityId: string;
  attributeMap: Record<string, string>;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  status: "active" | "suspended" | "trial" | "deleted";
  plan: "free" | "starter" | "pro" | "enterprise";
  settings: TenantSettings;
  oidcConfig?: OidcConfig;
  samlConfig?: SamlConfig;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateTenantData = Omit<
  Tenant,
  "id" | "createdAt" | "updatedAt" | "settings" | "status" | "plan" | "oidcConfig" | "samlConfig"
> & {
  status?: Tenant["status"];
  plan?: Tenant["plan"];
  settings?: Partial<TenantSettings>;
  oidcConfig?: OidcConfig;
  samlConfig?: SamlConfig;
};

export type UpdateTenantData = Partial<Omit<Tenant, "id" | "slug" | "createdAt" | "updatedAt">>;

const DEFAULT_SETTINGS: TenantSettings = {
  allowedDomains: [],
  enforceSSO: false,
  mfaRequired: false,
  sessionTTL: 3600,
  maxUsers: 100,
  allowedCountries: [],
};

// In-memory store keyed by tenant id
const store = new Map<string, Tenant>();

export function getTenant(id: string): Tenant | undefined {
  return store.get(id);
}

export function getTenantBySlug(slug: string): Tenant | undefined {
  for (const tenant of store.values()) {
    if (tenant.slug === slug) return tenant;
  }
  return undefined;
}

export function getAllTenants(): Tenant[] {
  return Array.from(store.values());
}

export function createTenant(data: CreateTenantData): Tenant {
  const now = new Date();
  const tenant: Tenant = {
    id: crypto.randomUUID(),
    slug: data.slug,
    name: data.name,
    displayName: data.displayName,
    status: data.status ?? "active",
    plan: data.plan ?? "free",
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    oidcConfig: data.oidcConfig,
    samlConfig: data.samlConfig,
    createdAt: now,
    updatedAt: now,
  };
  store.set(tenant.id, tenant);
  return tenant;
}

export function updateTenant(id: string, data: UpdateTenantData): Tenant | undefined {
  const existing = store.get(id);
  if (!existing) return undefined;
  const updated: Tenant = {
    ...existing,
    ...data,
    settings:
      data.settings !== undefined ? { ...existing.settings, ...data.settings } : existing.settings,
    updatedAt: new Date(),
  };
  store.set(id, updated);
  return updated;
}

export function deleteTenant(id: string): boolean {
  return store.delete(id);
}
