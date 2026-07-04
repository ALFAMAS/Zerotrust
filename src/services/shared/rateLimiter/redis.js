"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initRedisRateLimiter = initRedisRateLimiter;
exports.consumePoint = consumePoint;
exports.shutdownRedisRateLimiter = shutdownRedisRateLimiter;
exports.pingRedis = pingRedis;
exports.getRedis = getRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const index_1 = require("../../../logger/index");
const logger = (0, index_1.getLogger)("redis-rate-limiter");
let client = null;
async function initRedisRateLimiter(redisUri) {
    if (client)
        return client;
    client = new ioredis_1.default(redisUri);
    client.on("error", (err) => logger.error("Redis error", err));
    client.on("connect", () => logger.info("Redis rate limiter connected"));
    return client;
}
/**
 * Consume a point for the given key. Returns { allowed, remaining }
 */
async function consumePoint(key, points, windowSecs) {
    if (!client)
        throw new Error("Redis client not initialized");
    const redisKey = `rate:${windowSecs}:${key}`;
    const cur = await client.incr(redisKey);
    if (cur === 1) {
        await client.expire(redisKey, windowSecs);
    }
    const allowed = cur <= points;
    const remaining = Math.max(0, points - cur);
    return { allowed, remaining, current: cur };
}
async function shutdownRedisRateLimiter() {
    if (client) {
        try {
            await client.quit();
        }
        catch {
            client.disconnect();
        }
        client = null;
    }
}
async function pingRedis() {
    if (!client)
        return false;
    try {
        const res = await client.ping();
        return res === "PONG" || res === "OK";
    }
    catch {
        return false;
    }
}
/** Get the raw Redis client (for OAuth state, exchange codes, etc.) */
function getRedis() {
    return client;
}
//# sourceMappingURL=redis.js.map