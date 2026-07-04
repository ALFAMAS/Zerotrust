"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_STATE_CACHE_TTL_SECONDS = void 0;
exports.getUserCached = getUserCached;
exports.cacheUserState = cacheUserState;
exports.invalidateUserCache = invalidateUserCache;
const index_1 = require("../../logger/index");
const redis_1 = require("../shared/rateLimiter/redis");
const logger = (0, index_1.getLogger)("user-state-cache");
const USER_STATE_CACHE_TTL_SECONDS = 5;
exports.USER_STATE_CACHE_TTL_SECONDS = USER_STATE_CACHE_TTL_SECONDS;
const USER_STATE_CACHE_PREFIX = "auth:user:";
function key(userId) {
    return `${USER_STATE_CACHE_PREFIX}${userId}`;
}
function toDate(value) {
    if (!value)
        return null;
    return value instanceof Date ? value : new Date(value);
}
function hydrateUser(row) {
    return {
        ...row,
        createdAt: toDate(row.createdAt) ?? new Date(0),
        updatedAt: toDate(row.updatedAt) ?? new Date(0),
        lastLoginAt: toDate(row.lastLoginAt),
        emailVerifiedAt: toDate(row.emailVerifiedAt),
    };
}
/**
 * Return a user row from the short-lived auth cache, or null when Redis is not
 * configured, the key is absent, or the cached payload is invalid. This function
 * intentionally does not query Postgres; callers decide whether to do a joined
 * fallback query so the auth hot path can stay at one DB round-trip on misses.
 */
async function getUserCached(userId) {
    const redis = (0, redis_1.getRedis)();
    if (!redis)
        return null;
    try {
        const raw = await redis.get(key(userId));
        if (!raw)
            return null;
        return hydrateUser(JSON.parse(raw));
    }
    catch (error) {
        logger.warn("User cache read failed", { userId, error: String(error) });
        return null;
    }
}
async function cacheUserState(user) {
    const redis = (0, redis_1.getRedis)();
    if (!redis)
        return;
    try {
        await redis.set(key(user.id), JSON.stringify(user), "EX", USER_STATE_CACHE_TTL_SECONDS);
    }
    catch (error) {
        logger.warn("User cache write failed", { userId: user.id, error: String(error) });
    }
}
async function invalidateUserCache(userId) {
    const redis = (0, redis_1.getRedis)();
    if (!redis)
        return;
    try {
        await redis.del(key(userId));
    }
    catch (error) {
        logger.warn("User cache invalidation failed", { userId, error: String(error) });
    }
}
//# sourceMappingURL=userStateCache.service.js.map