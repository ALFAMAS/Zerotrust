import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../shared/types";
import { getConfig } from "../config";
import { getLogger } from "../logger";
import { ErrorCodes } from "../shared/types";
import { clearInMemoryBuckets } from "../services/rateLimiter/inmemory";

let useRedis = false as boolean;
let redisConsume:
  | ((
      key: string,
      points: number,
      windowSecs: number
    ) => Promise<{ allowed: boolean; remaining: number; current: number }>)
  | null = null;

const logger = getLogger("rate-limiter");

type Bucket = { count: number; windowStart: number };
const ipBuckets: Map<string, Bucket> = new Map();

export async function initRateLimiter(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.rateLimiting.enabled) {
    logger.info("Rate limiting disabled by configuration");
    return;
  }

  if (cfg.rateLimiting.redisUri) {
    try {
      const { initRedisRateLimiter, consumePoint } =
        await import("../services/rateLimiter/redis.js");
      await initRedisRateLimiter(cfg.rateLimiting.redisUri!);
      redisConsume = consumePoint;
      useRedis = true;
      logger.info("Rate limiter initialized (redis-backed)");
      return;
    } catch (err) {
      logger.warn("Failed to initialize redis rate limiter, falling back to in-memory", {
        error: String(err),
      });
    }
  }

  logger.info("Rate limiter initialized (in-memory)");
}

export function rateLimit(options?: { points?: number; windowSecs?: number }) {
  const cfg = getConfig();
  const points = options?.points ?? cfg.rateLimiting.perIpLimit;
  const windowSecs = options?.windowSecs ?? cfg.rateLimiting.windowSecs;

  return createMiddleware<HonoEnv>(async (c, next) => {
    if (!cfg.rateLimiting.enabled) return next();

    try {
      const ip =
        c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
        c.req.header("x-real-ip") ||
        "unknown";

      if (useRedis && redisConsume) {
        const { allowed } = await redisConsume(ip, points, windowSecs);
        if (!allowed) {
          logger.warn("Rate limit exceeded (redis)", { ip, path: c.req.path });
          c.header("Retry-After", String(windowSecs));
          return c.json(
            { error: ErrorCodes.RATE_LIMIT_EXCEEDED, message: "Too many requests" },
            429
          );
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
        return c.json({ error: ErrorCodes.RATE_LIMIT_EXCEEDED, message: "Too many requests" }, 429);
      }

      bucket.count += 1;
      ipBuckets.set(ip, bucket);
      return next();
    } catch (err) {
      logger.error("Rate limiter error", err as Error);
      return next();
    }
  });
}

export function clearRateLimiter(): void {
  ipBuckets.clear();
  clearInMemoryBuckets();
}

// ─── Multi-Tenant Rate Limiting ───────────────────────────────────────────────

interface TenantQuota {
  requestsPerMinute: number;
  burstAllowance: number;
}

const tenantQuotaMap = new Map<string, TenantQuota>();

export function configureTenantQuota(
  tenantId: string,
  quota: { requestsPerMinute: number; burstAllowance?: number }
): void {
  tenantQuotaMap.set(tenantId, {
    requestsPerMinute: quota.requestsPerMinute,
    burstAllowance: quota.burstAllowance ?? Math.ceil(quota.requestsPerMinute * 0.2),
  });
}

export function getTenantQuota(tenantId: string): TenantQuota | null {
  return tenantQuotaMap.get(tenantId) ?? null;
}

export function tenantRateLimit(opts: { windowMs: number; max: number; message?: string }) {
  const windowSecs = Math.ceil(opts.windowMs / 1000);
  const defaultMax = opts.max;
  const message = opts.message ?? "Too many requests";

  return createMiddleware<HonoEnv>(async (c, next) => {
    const cfg = getConfig();
    if (!cfg.rateLimiting.enabled) return next();

    const tenantId: string | undefined = (c as any).tenantId;
    let key: string;
    let points: number;

    if (tenantId) {
      const storedQuota = tenantQuotaMap.get(tenantId);
      points = storedQuota ? storedQuota.requestsPerMinute : defaultMax;
      key = `tenant:${tenantId}`;
    } else {
      points = defaultMax;
      const ip =
        c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
        c.req.header("x-real-ip") ||
        "unknown";
      key = `ip:${ip}`;
    }

    if (useRedis && redisConsume) {
      const { allowed } = await redisConsume(key, points, windowSecs);
      if (!allowed) {
        logger.warn("Tenant rate limit exceeded (redis)", { key, path: c.req.path });
        c.header("Retry-After", String(windowSecs));
        return c.json({ error: ErrorCodes.RATE_LIMIT_EXCEEDED, message }, 429);
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
      return c.json({ error: ErrorCodes.RATE_LIMIT_EXCEEDED, message }, 429);
    }

    bucket.count += 1;
    ipBuckets.set(key, bucket);
    return next();
  });
}
