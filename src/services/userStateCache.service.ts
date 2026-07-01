import type { usersTable } from "../db/schema";
import { getLogger } from "../logger";
import { getRedis } from "./rateLimiter/redis";

const logger = getLogger("user-state-cache");
const USER_STATE_CACHE_TTL_SECONDS = 5;
const USER_STATE_CACHE_PREFIX = "auth:user:";

type UserRow = typeof usersTable.$inferSelect;

type SerializedUserRow = Omit<
  UserRow,
  "createdAt" | "updatedAt" | "lastLoginAt" | "emailVerifiedAt"
> & {
  createdAt: string | Date;
  updatedAt: string | Date;
  lastLoginAt: string | Date | null;
  emailVerifiedAt: string | Date | null;
};

function key(userId: string): string {
  return `${USER_STATE_CACHE_PREFIX}${userId}`;
}

function toDate(value: string | Date | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function hydrateUser(row: SerializedUserRow): UserRow {
  return {
    ...row,
    createdAt: toDate(row.createdAt) ?? new Date(0),
    updatedAt: toDate(row.updatedAt) ?? new Date(0),
    lastLoginAt: toDate(row.lastLoginAt),
    emailVerifiedAt: toDate(row.emailVerifiedAt),
  } as UserRow;
}

/**
 * Return a user row from the short-lived auth cache, or null when Redis is not
 * configured, the key is absent, or the cached payload is invalid. This function
 * intentionally does not query Postgres; callers decide whether to do a joined
 * fallback query so the auth hot path can stay at one DB round-trip on misses.
 */
export async function getUserCached(userId: string): Promise<UserRow | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get(key(userId));
    if (!raw) return null;
    return hydrateUser(JSON.parse(raw) as SerializedUserRow);
  } catch (error) {
    logger.warn("User cache read failed", { userId, error: String(error) });
    return null;
  }
}

export async function cacheUserState(user: UserRow): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(key(user.id), JSON.stringify(user), "EX", USER_STATE_CACHE_TTL_SECONDS);
  } catch (error) {
    logger.warn("User cache write failed", { userId: user.id, error: String(error) });
  }
}

export async function invalidateUserCache(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(key(userId));
  } catch (error) {
    logger.warn("User cache invalidation failed", { userId, error: String(error) });
  }
}

export { USER_STATE_CACHE_TTL_SECONDS };
