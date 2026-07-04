"use strict";
/**
 * In-memory token bucket rate limiter for single-process deployments.
 * Acts as a fast pre-check before the Redis limiter.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.consumeInMemory = consumeInMemory;
exports.isIpBanned = isIpBanned;
exports.clearInMemoryBuckets = clearInMemoryBuckets;
exports.pruneExpiredBuckets = pruneExpiredBuckets;
const index_1 = require("../../../logger/index");
const logger = (0, index_1.getLogger)("inmemory-rate-limiter");
const buckets = new Map();
const banList = new Map();
const DEFAULT_CAPACITY = 100;
const DEFAULT_WINDOW_SECS = 60;
const BAN_THRESHOLD = 5;
const DEFAULT_BAN_SECS = 300;
function refillTokens(bucket, capacity, refillRate, windowSecs) {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = (elapsed / windowSecs) * refillRate;
    bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
    return bucket.tokens;
}
function consumeInMemory(key, points = 1, capacity = DEFAULT_CAPACITY, windowSecs = DEFAULT_WINDOW_SECS) {
    const now = Date.now();
    const ban = banList.get(key);
    if (ban && ban.bannedUntil > 0 && now < ban.bannedUntil) {
        const banSeconds = Math.ceil((ban.bannedUntil - now) / 1000);
        return { allowed: false, remaining: 0, banSeconds };
    }
    else if (ban && ban.bannedUntil > 0 && now >= ban.bannedUntil) {
        banList.delete(key);
    }
    let bucket = buckets.get(key);
    if (!bucket) {
        bucket = { tokens: capacity, lastRefill: now };
        buckets.set(key, bucket);
    }
    refillTokens(bucket, capacity, capacity, windowSecs);
    if (bucket.tokens < points) {
        const existing = banList.get(key);
        const violations = (existing?.violations ?? 0) + 1;
        if (violations >= BAN_THRESHOLD) {
            const banDuration = DEFAULT_BAN_SECS * Math.min(violations - BAN_THRESHOLD + 1, 8);
            banList.set(key, { bannedUntil: now + banDuration * 1000, violations });
            logger.warn("IP temporarily banned due to repeated violations", {
                key,
                banDuration,
                violations,
            });
            return { allowed: false, remaining: 0, banSeconds: banDuration };
        }
        banList.set(key, { bannedUntil: 0, violations });
        return { allowed: false, remaining: 0 };
    }
    bucket.tokens -= points;
    return { allowed: true, remaining: Math.floor(bucket.tokens) };
}
function isIpBanned(key) {
    const now = Date.now();
    const ban = banList.get(key);
    if (ban && now < ban.bannedUntil) {
        return { banned: true, seconds: Math.ceil((ban.bannedUntil - now) / 1000) };
    }
    return { banned: false };
}
function clearInMemoryBuckets() {
    buckets.clear();
    banList.clear();
}
function pruneExpiredBuckets() {
    const now = Date.now();
    for (const [key, ban] of banList) {
        if (now >= ban.bannedUntil && ban.violations < BAN_THRESHOLD) {
            banList.delete(key);
        }
    }
    for (const [key, bucket] of buckets) {
        if (now - bucket.lastRefill > 600000) {
            buckets.delete(key);
        }
    }
}
setInterval(pruneExpiredBuckets, 5 * 60 * 1000).unref();
//# sourceMappingURL=inmemory.js.map