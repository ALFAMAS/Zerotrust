/**
 * Tenant model — PostgreSQL (Drizzle) backed.
 * Persists tenants in the `tenants` table so multi-tenancy, per-tenant SSO
 * config, and plan changes survive restarts.
 */

import { eq } from "drizzle-orm";
import { getDb, getReadDb } from "../db/index.js";
import { tenantsTable } from "../db/schema.js";

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rowToTenant(row: typeof tenantsTable.$inferSelect): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    displayName: row.displayName,
    status: row.status as Tenant["status"],
    plan: row.plan as Tenant["plan"],
    settings: row.settings,
    oidcConfig: row.oidcConfig ?? undefined,
    samlConfig: row.samlConfig ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getTenant(id: string): Promise<Tenant | undefined> {
  // Guard: querying a uuid column with a non-uuid string errors in Postgres.
  if (!UUID_RE.test(id)) return undefined;
  const rows = await getReadDb()
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, id))
    .limit(1);
  return rows[0] ? rowToTenant(rows[0]) : undefined;
}

export async function getTenantBySlug(slug: string): Promise<Tenant | undefined> {
  const rows = await getReadDb()
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug))
    .limit(1);
  return rows[0] ? rowToTenant(rows[0]) : undefined;
}

export async function getAllTenants(): Promise<Tenant[]> {
  const rows = await getReadDb().select().from(tenantsTable);
  return rows.map(rowToTenant);
}

export async function createTenant(data: CreateTenantData): Promise<Tenant> {
  const [row] = await getDb()
    .insert(tenantsTable)
    .values({
      slug: data.slug,
      name: data.name,
      displayName: data.displayName,
      status: data.status ?? "active",
      plan: data.plan ?? "free",
      settings: { ...DEFAULT_SETTINGS, ...data.settings },
      oidcConfig: data.oidcConfig ?? null,
      samlConfig: data.samlConfig ?? null,
    })
    .returning();
  return rowToTenant(row);
}

export async function updateTenant(
  id: string,
  data: UpdateTenantData
): Promise<Tenant | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const [existingRow] = await getDb()
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, id))
    .limit(1);
  if (!existingRow) return undefined;
  const existing = rowToTenant(existingRow);

  const patch: Partial<typeof tenantsTable.$inferInsert> = { updatedAt: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.displayName !== undefined) patch.displayName = data.displayName;
  if (data.status !== undefined) patch.status = data.status;
  if (data.plan !== undefined) patch.plan = data.plan;
  if (data.settings !== undefined) patch.settings = { ...existing.settings, ...data.settings };
  if (data.oidcConfig !== undefined) patch.oidcConfig = data.oidcConfig;
  if (data.samlConfig !== undefined) patch.samlConfig = data.samlConfig;

  const [row] = await getDb()
    .update(tenantsTable)
    .set(patch)
    .where(eq(tenantsTable.id, id))
    .returning();
  return row ? rowToTenant(row) : undefined;
}

export async function deleteTenant(id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const rows = await getDb()
    .delete(tenantsTable)
    .where(eq(tenantsTable.id, id))
    .returning({ id: tenantsTable.id });
  return rows.length > 0;
}
