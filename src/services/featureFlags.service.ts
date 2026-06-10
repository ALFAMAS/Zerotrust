/**
 * Feature flags — DB-backed flags with three activation paths:
 *   1. globally enabled
 *   2. force-enabled for specific user IDs
 *   3. percentage rollout (stable per-user bucketing via FNV-1a hash)
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { featureFlagsTable } from "../db/schema";
import { getLogger } from "../logger";

const logger = getLogger("feature-flags");

type FlagRow = typeof featureFlagsTable.$inferSelect;

// Small read-through cache so per-request checks don't hit the DB.
const cache = new Map<string, { flag: FlagRow | null; loadedAt: number }>();
const CACHE_TTL_MS = 30_000;

function bucketFor(flagKey: string, userId: string): number {
  // FNV-1a over key+user gives a stable 0-99 bucket
  let hash = 0x811c9dc5;
  const input = `${flagKey}:${userId}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

async function loadFlag(key: string): Promise<FlagRow | null> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.flag;

  try {
    const db = getDb();
    const [flag] = await db
      .select()
      .from(featureFlagsTable)
      .where(eq(featureFlagsTable.key, key))
      .limit(1);
    cache.set(key, { flag: flag ?? null, loadedAt: Date.now() });
    return flag ?? null;
  } catch (err) {
    logger.error("Failed to load feature flag", err as Error);
    return null;
  }
}

/** Check whether a flag is enabled (optionally for a specific user). */
export async function isFeatureEnabled(key: string, userId?: string): Promise<boolean> {
  const flag = await loadFlag(key);
  if (!flag) return false;
  if (flag.enabled) return true;
  if (userId) {
    if (flag.enabledForUsers.includes(userId)) return true;
    if (flag.rolloutPercent > 0) return bucketFor(key, userId) < flag.rolloutPercent;
  }
  return false;
}

export function clearFlagCache(): void {
  cache.clear();
}

// ── Admin CRUD helpers ────────────────────────────────────────────────────────

export async function listFlags(): Promise<FlagRow[]> {
  const db = getDb();
  return db.select().from(featureFlagsTable);
}

export async function upsertFlag(input: {
  key: string;
  description?: string;
  enabled?: boolean;
  enabledForUsers?: string[];
  rolloutPercent?: number;
}): Promise<FlagRow> {
  const db = getDb();
  const [flag] = await db
    .insert(featureFlagsTable)
    .values({
      key: input.key,
      description: input.description,
      enabled: input.enabled ?? false,
      enabledForUsers: input.enabledForUsers ?? [],
      rolloutPercent: Math.min(100, Math.max(0, input.rolloutPercent ?? 0)),
    })
    .onConflictDoUpdate({
      target: featureFlagsTable.key,
      set: {
        ...(input.description !== undefined && { description: input.description }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        ...(input.enabledForUsers !== undefined && { enabledForUsers: input.enabledForUsers }),
        ...(input.rolloutPercent !== undefined && {
          rolloutPercent: Math.min(100, Math.max(0, input.rolloutPercent)),
        }),
        updatedAt: new Date(),
      },
    })
    .returning();
  cache.delete(input.key);
  return flag;
}

export async function deleteFlag(key: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(featureFlagsTable)
    .where(eq(featureFlagsTable.key, key))
    .returning({ id: featureFlagsTable.id });
  cache.delete(key);
  return deleted.length > 0;
}
