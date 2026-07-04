import { eq, sql } from "drizzle-orm";
import { getDb, getReadDb } from "../../db/index";
import { type OrgBranding, organizationsTable } from "../../db/schema";

// ── Custom domain / subdomain resolution ────────────────────────────────────

export interface ResolvedOrg {
  orgId: string;
  orgName: string;
  orgSlug: string;
  customDomain: string | null;
  branding: ResolvedBranding;
}

export interface ResolvedBranding {
  appName?: string;
  brandColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  hidePoweredBy: boolean;
  emailFromAddress?: string;
  emailDomain?: string;
  customLoginUrl?: string;
}

const DEFAULT_BRANDING: ResolvedBranding = {
  hidePoweredBy: false,
};

const orgCache = new Map<string, { data: ResolvedOrg; expiresAt: number }>();
const ORG_CACHE_TTL_MS = 30_000;

function cacheGet(key: string): ResolvedOrg | null {
  const entry = orgCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  if (entry) orgCache.delete(key);
  return null;
}

function cacheSet(key: string, org: ResolvedOrg): void {
  orgCache.set(key, { data: org, expiresAt: Date.now() + ORG_CACHE_TTL_MS });
}

export async function resolveOrgByDomain(hostname: string): Promise<ResolvedOrg | null> {
  const cached = cacheGet(hostname);
  if (cached) return cached;

  const db = getReadDb();
  const baseDomain = process.env.APP_BASE_DOMAIN?.toLowerCase();
  const normalizedHost = hostname.toLowerCase().split(":")[0] ?? hostname.toLowerCase();

  let orgRow: typeof organizationsTable.$inferSelect | undefined;

  // 1. Try custom domain lookup
  const [byDomain] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.customDomain, normalizedHost))
    .limit(1);
  orgRow = byDomain;

  // 2. Try subdomain lookup
  if (!orgRow && baseDomain && normalizedHost.endsWith(`.${baseDomain}`)) {
    const subdomain = normalizedHost.slice(0, -(baseDomain.length + 1));
    if (!subdomain.includes(".") && subdomain.length > 0) {
      const [bySlug] = await db
        .select()
        .from(organizationsTable)
        .where(eq(organizationsTable.slug, subdomain))
        .limit(1);
      orgRow = bySlug;
    }
  }

  if (!orgRow) return null;

  const resolved: ResolvedOrg = {
    orgId: orgRow.id,
    orgName: orgRow.name,
    orgSlug: orgRow.slug,
    customDomain: orgRow.customDomain ?? null,
    branding: {
      ...DEFAULT_BRANDING,
      ...(orgRow.branding ?? {}),
      hidePoweredBy: orgRow.branding?.hidePoweredBy ?? false,
    },
  };

  cacheSet(hostname, resolved);
  return resolved;
}

export async function getOrgBranding(orgId: string): Promise<ResolvedBranding> {
  const cacheKey = `branding:${orgId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached.branding;

  const db = getReadDb();
  const [org] = await db
    .select({ branding: organizationsTable.branding })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  if (!org) return DEFAULT_BRANDING;

  const branding: ResolvedBranding = {
    ...DEFAULT_BRANDING,
    ...(org.branding ?? {}),
  };

  cacheSet(cacheKey, {
    orgId,
    orgName: "",
    orgSlug: "",
    customDomain: null,
    branding,
  });

  return branding;
}

export async function setOrgCustomDomain(orgId: string, domain: string | null): Promise<boolean> {
  const db = getDb();
  if (domain) {
    const DOMAIN_RE = /^(?!:\/\/)([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;
    if (!DOMAIN_RE.test(domain)) throw new Error("Invalid domain format");
    const [existing] = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(
        sql`${organizationsTable.customDomain} = ${domain} AND ${organizationsTable.id} != ${orgId}`
      )
      .limit(1);
    if (existing) throw new Error(`Domain ${domain} is already in use`);
  }
  await db
    .update(organizationsTable)
    .set({ customDomain: domain, updatedAt: new Date() })
    .where(eq(organizationsTable.id, orgId));
  orgCache.clear();
  return true;
}

export async function setOrgBranding(
  orgId: string,
  branding: Partial<ResolvedBranding>
): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ branding: organizationsTable.branding })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  const merged: OrgBranding = { ...(existing?.branding ?? {}), ...branding };
  await db
    .update(organizationsTable)
    .set({ branding: merged, updatedAt: new Date() })
    .where(eq(organizationsTable.id, orgId));
  orgCache.clear();
}
