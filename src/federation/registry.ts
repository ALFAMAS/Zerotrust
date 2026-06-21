import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { federatedProvidersTable } from "../db/schema.js";
import type { FederatedProvider } from "./types.js";

type ProviderRow = typeof federatedProvidersTable.$inferSelect;

function fromRow(row: ProviderRow): FederatedProvider {
  return {
    id: row.id,
    name: row.name,
    issuerUrl: row.issuerUrl,
    jwksUri: row.jwksUri ?? undefined,
    trustedTenantId: row.trustedTenantId ?? undefined,
    enabled: row.enabled,
    createdAt: row.createdAt,
  };
}

/**
 * Register (or update) a trusted federation provider. Durable — persisted to
 * `federated_providers`. Upserts on the caller-supplied provider id.
 */
export async function registerProvider(
  p: Omit<FederatedProvider, "createdAt">
): Promise<FederatedProvider> {
  const db = getDb();
  const [row] = await db
    .insert(federatedProvidersTable)
    .values({
      id: p.id,
      name: p.name,
      issuerUrl: p.issuerUrl,
      jwksUri: p.jwksUri ?? null,
      trustedTenantId: p.trustedTenantId ?? null,
      enabled: p.enabled,
    })
    .onConflictDoUpdate({
      target: federatedProvidersTable.id,
      set: {
        name: p.name,
        issuerUrl: p.issuerUrl,
        jwksUri: p.jwksUri ?? null,
        trustedTenantId: p.trustedTenantId ?? null,
        enabled: p.enabled,
      },
    })
    .returning();
  return fromRow(row);
}

export async function getProvider(id: string): Promise<FederatedProvider | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(federatedProvidersTable)
    .where(eq(federatedProvidersTable.id, id))
    .limit(1);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function listProviders(): Promise<FederatedProvider[]> {
  const db = getDb();
  const rows = await db.select().from(federatedProvidersTable);
  return rows.map(fromRow);
}

export async function removeProvider(id: string): Promise<boolean> {
  const db = getDb();
  const removed = await db
    .delete(federatedProvidersTable)
    .where(eq(federatedProvidersTable.id, id))
    .returning({ id: federatedProvidersTable.id });
  return removed.length > 0;
}

/**
 * Seed providers from the FEDERATION_PROVIDERS env var (JSON array). Upserts so
 * env-declared providers are reconciled on every boot without clobbering ones
 * added later via the admin UI.
 */
export async function initFederationFromEnv(): Promise<void> {
  const raw = process.env.FEDERATION_PROVIDERS;
  if (!raw) return;
  try {
    const list = JSON.parse(raw) as Array<Omit<FederatedProvider, "createdAt">>;
    for (const entry of list) {
      const { enabled, ...rest } = entry;
      await registerProvider({ enabled: enabled ?? true, ...rest });
    }
  } catch {
    // malformed env var — silently skip
  }
}
