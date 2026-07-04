"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initRateLimiter = initRateLimiter;
exports.rateLimit = rateLimit;
exports.clearRateLimiter = clearRateLimiter;
exports.consumeRateLimit = consumeRateLimit;
exports.configureTenantQuota = configureTenantQuota;
exports.getTenantQuota = getTenantQuota;
exports.tenantRateLimit = tenantRateLimit;
const factory_1 = require("hono/factory");
const config_1 = require("../config");
const logger_1 = require("../logger");
const inmemory_1 = require("../services/shared/rateLimiter/inmemory");
const types_1 = require("../shared/types");
let useRedis = false;
let redisConsume = null;
const logger = (0, logger_1.getLogger)("rate-limiter");
const ipBuckets = new Map();
async function initRateLimiter() {
    const cfg = (0, config_1.getConfig)();
    if (!cfg.rateLimiting.enabled) {
        logger.info("Rate limiting disabled by configuration");
        return;
    }
    if (cfg.rateLimiting.redisUri) {
        try {
            const { initRedisRateLimiter, consumePoint } = await import("../services/shared/rateLimiter/redis.js");
            await initRedisRateLimiter(cfg.rateLimiting.redisUri);
            redisConsume = consumePoint;
            useRedis = true;
            logger.info("Rate limiter initialized (redis-backed)");
            return;
        }
        catch (err) {
            logger.warn("Failed to initialize redis rate limiter, falling back to in-memory", {
                error: String(err),
            });
        }
    }
    logger.info("Rate limiter initialized (in-memory)");
}
function rateLimit(options) {
    const cfg = (0, config_1.getConfig)();
    const points = options?.points ?? cfg.rateLimiting.perIpLimit;
    const windowSecs = options?.windowSecs ?? cfg.rateLimiting.windowSecs;
    return (0, factory_1.createMiddleware)(async (c, next) => {
        if (!cfg.rateLimiting.enabled)
            return next();
        try {
            const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
                c.req.header("x-real-ip") ||
                "unknown";
            if (useRedis && redisConsume) {
                const { allowed } = await redisConsume(ip, points, windowSecs);
                if (!allowed) {
                    logger.warn("Rate limit exceeded (redis)", { ip, path: c.req.path });
                    c.header("Retry-After", String(windowSecs));
                    return c.json({ error: types_1.ErrorCodes.RATE_LIMIT_EXCEEDED, message: "Too many requests" }, 429);
                }
                return next();
            }
            const now = Math.floor(Date.now() / 1000);
            const bucket = ipBuckets.get(ip);
            if (!bucket) {
                ipBuckets.set(ip, { count: 1, windowStart: now });
                return next();
            }
            if (now - bucket.windowStart >= windowSecs) {
                ipBuckets.set(ip, { count: 1, windowStart: now });
                return next();
            }
            if (bucket.count + 1 > points) {
                logger.warn("Rate limit exceeded", { ip, path: c.req.path });
                c.header("Retry-After", String(windowSecs - (now - bucket.windowStart)));
                return c.json({ error: types_1.ErrorCodes.RATE_LIMIT_EXCEEDED, message: "Too many requests" }, 429);
            }
            bucket.count += 1;
            ipBuckets.set(ip, bucket);
            return next();
        }
        catch (err) {
            logger.error("Rate limiter error", err);
            return next();
        }
    });
}
function clearRateLimiter() {
    ipBuckets.clear();
    (0, inmemory_1.clearInMemoryBuckets)();
}
async function consumeRateLimit(key, points, windowSecs) {
    if (useRedis && redisConsume) {
        const { allowed, remaining } = await redisConsume(key, points, windowSecs);
        return { allowed, retryAfterSecs: windowSecs, remaining };
    }
    const now = Math.floor(Date.now() / 1000);
    const bucket = ipBuckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowSecs) {
        ipBuckets.set(key, { count: 1, windowStart: now });
        return { allowed: true, retryAfterSecs: windowSecs, remaining: Math.max(points - 1, 0) };
    }
    if (bucket.count + 1 > points) {
        return {
            allowed: false,
            retryAfterSecs: windowSecs - (now - bucket.windowStart),
            remaining: 0,
        };
    }
    bucket.count += 1;
    ipBuckets.set(key, bucket);
    return {
        allowed: true,
        retryAfterSecs: windowSecs - (now - bucket.windowStart),
        remaining: points - bucket.count,
    };
}
const tenantQuotaMap = new Map();
function configureTenantQuota(tenantId, quota) {
    tenantQuotaMap.set(tenantId, {
        requestsPerMinute: quota.requestsPerMinute,
        burstAllowance: quota.burstAllowance ?? Math.ceil(quota.requestsPerMinute * 0.2),
    });
}
function getTenantQuota(tenantId) {
    return tenantQuotaMap.get(tenantId) ?? null;
}
function tenantRateLimit(opts) {
    const windowSecs = Math.ceil(opts.windowMs / 1000);
    const defaultMax = opts.max;
    const message = opts.message ?? "Too many requests";
    return (0, factory_1.createMiddleware)(async (c, next) => {
        const cfg = (0, config_1.getConfig)();
        if (!cfg.rateLimiting.enabled)
            return next();
        const user = c.get("user");
        let key;
        let points;
        // Buckets are keyed by authenticated principal id or client IP — never by a
        // request-supplied tenant header (audit finding M9).
        if (user?.id) {
            const storedQuota = tenantQuotaMap.get(user.id);
            points = storedQuota ? storedQuota.requestsPerMinute : defaultMax;
            key = `user:${user.id}`;
        }
        else {
            points = defaultMax;
            const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
                c.req.header("x-real-ip") ||
                "unknown";
            key = `ip:${ip}`;
        }
        if (useRedis && redisConsume) {
            const { allowed } = await redisConsume(key, points, windowSecs);
            if (!allowed) {
                logger.warn("Tenant rate limit exceeded (redis)", { key, path: c.req.path });
                c.header("Retry-After", String(windowSecs));
                return c.json({ error: types_1.ErrorCodes.RATE_LIMIT_EXCEEDED, message }, 429);
            }
            return next();
        }
        const now = Math.floor(Date.now() / 1000);
        const bucket = ipBuckets.get(key);
        if (!bucket) {
            ipBuckets.set(key, { count: 1, windowStart: now });
            return next();
        }
        if (now - bucket.windowStart >= windowSecs) {
            ipBuckets.set(key, { count: 1, windowStart: now });
            return next();
        }
        if (bucket.count + 1 > points) {
            logger.warn("Tenant rate limit exceeded", { key, path: c.req.path });
            c.header("Retry-After", String(windowSecs - (now - bucket.windowStart)));
            return c.json({ error: types_1.ErrorCodes.RATE_LIMIT_EXCEEDED, message }, 429);
        }
        bucket.count += 1;
        ipBuckets.set(key, bucket);
        return next();
    });
}
//# sourceMappingURL=rateLimiting.js.map