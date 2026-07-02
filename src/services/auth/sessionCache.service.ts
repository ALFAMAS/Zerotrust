import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index";
import { sessionsTable } from "../../db/schema";
import { getLogger } from "../../logger/index";

const logger = getLogger("session-cache");

/**
 * Session validation cache — Redis-backed cache for session:{tokenId}
 * with TTL capped at expiresAt, explicit revocation invalidation,
 * debounced lastActivityAt writes, and DB fallback when Redis is down.
 */

interface CachedSession {
  userId: string;
  sessionId: string;
  tokenId: string;
  expiresAt: string;
  isActive: boolean;
}

// In-memory fallback when Redis is down
const localCache = new Map<string, { session: CachedSession; expiresAt: number }>();
const LOCAL_CACHE_MAX_SIZE = 10_000;

// Debounced lastActivityAt writes (batch every 30s)
const pendingActivityUpdates = new Map<string, Date>();
let activityFlushInterval: ReturnType<typeof setInterval> | null = null;

function startActivityFlusher(): void {
  if (activityFlushInterval) return;
  activityFlushInterval = setInterval(async () => {
    if (pendingActivityUpdates.size === 0) return;
    const updates = new Map(pendingActivityUpdates);
    pendingActivityUpdates.clear();
    const db = getDb();
    for (const [tokenId, lastActivity] of updates) {
      try {
        await db
          .update(sessionsTable)
          .set({ lastActivityAt: lastActivity })
          .where(eq(sessionsTable.tokenId, tokenId));
      } catch (err) {
        logger.warn("Failed to flush session activity", { tokenId, error: String(err) });
      }
    }
  }, 30_000);
  if (activityFlushInterval.unref) activityFlushInterval.unref();
}

startActivityFlusher();

async function getRedis(): Promise<any> {
  try {
    const { getRedis } = await import("../ops/rateLimiter/redis.js");
    return getRedis();
  } catch {
    return null;
  }
}

export async function getCachedSession(tokenId: string): Promise<CachedSession | null> {
  // Try Redis first
  const redis = await getRedis();
  if (redis) {
    try {
      const raw = await redis.get(`session:${tokenId}`);
      if (raw) return JSON.parse(raw);
      return null;
    } catch {
      // Redis error, fall through to local cache
    }
  }

  // Try local cache
  const cached = localCache.get(tokenId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.session;
  }
  if (cached) localCache.delete(tokenId);

  // DB fallback
  const db = getDb();
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.tokenId, tokenId), eq(sessionsTable.isActive, true)))
    .limit(1);

  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) return null;

  const cachedSession: CachedSession = {
    userId: session.userId,
    sessionId: session.id,
    tokenId: session.tokenId,
    expiresAt: session.expiresAt.toISOString(),
    isActive: session.isActive,
  };

  // Populate caches
  await cacheSession(tokenId, cachedSession);
  return cachedSession;
}

async function cacheSession(tokenId: string, session: CachedSession): Promise<void> {
  const expiresAt = new Date(session.expiresAt).getTime();
  const ttlMs = Math.max(0, expiresAt - Date.now());
  const ttlSecs = Math.ceil(ttlMs / 1000);

  // Try Redis
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.setex(`session:${tokenId}`, ttlSecs, JSON.stringify(session));
      return;
    } catch {
      // fall through to local cache
    }
  }

  // Local cache with bounded size
  if (localCache.size >= LOCAL_CACHE_MAX_SIZE) {
    // Evict oldest 25%
    const entries = [...localCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const evictCount = Math.floor(LOCAL_CACHE_MAX_SIZE * 0.25);
    for (let i = 0; i < evictCount; i++) localCache.delete(entries[i][0]);
  }
  localCache.set(tokenId, { session, expiresAt });
}

export async function invalidateSession(tokenId: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.del(`session:${tokenId}`);
    } catch {
      // ignore
    }
  }
  localCache.delete(tokenId);
}

export async function updateLastActivity(tokenId: string): Promise<void> {
  // Debounce: only flush every 30s
  pendingActivityUpdates.set(tokenId, new Date());
}
