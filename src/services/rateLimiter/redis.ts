import Redis from "ioredis";
import { getLogger } from "../../logger";

const logger = getLogger("redis-rate-limiter");

let client: Redis | null = null;

export async function initRedisRateLimiter(redisUri: string) {
  if (client) return client;
  client = new Redis(redisUri);
  client.on("error", (err) => logger.error("Redis error", err));
  client.on("connect", () => logger.info("Redis rate limiter connected"));
  return client;
}

/**
 * Consume a point for the given key. Returns { allowed, remaining }
 */
export async function consumePoint(key: string, points: number, windowSecs: number) {
  if (!client) throw new Error("Redis client not initialized");
  const redisKey = `rate:${windowSecs}:${key}`;
  const cur = await client.incr(redisKey);
  if (cur === 1) {
    await client.expire(redisKey, windowSecs);
  }
  const allowed = cur <= points;
  const remaining = Math.max(0, points - cur);
  return { allowed, remaining, current: cur };
}

export async function shutdownRedisRateLimiter() {
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
    client = null;
  }
}

export async function pingRedis(): Promise<boolean> {
  if (!client) return false;
  try {
    const res = await client.ping();
    return res === "PONG" || res === "OK";
  } catch {
    return false;
  }
}

/** Get the raw Redis client (for OAuth state, exchange codes, etc.) */
export function getRedis(): Redis | null {
  return client;
}
