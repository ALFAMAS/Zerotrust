/**
 * Rate limiting middleware (in-memory primary, Redis optional stub)
 * - Per-IP sliding window
 * - Per-endpoint configurable limits via options
 */

import type { Request, Response, NextFunction } from "express";
import { getConfig } from "../config";
import { getLogger } from "../logger";
import { ZeroAuthError, ErrorCodes } from "../shared/types";
import type { Redis } from "ioredis";
let useRedis = false as boolean;
let redisConsume:
  | ((
      key: string,
      points: number,
      windowSecs: number
    ) => Promise<{ allowed: boolean; remaining: number; current: number }>)
  | null = null;

const logger = getLogger("rate-limiter");

type Bucket = {
  count: number;
  windowStart: number; // epoch seconds
};

const ipBuckets: Map<string, Bucket> = new Map();

/** Initialize rate limiter (placeholder for Redis-backed init) */
export async function initRateLimiter(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.rateLimiting.enabled) {
    logger.info("Rate limiting disabled by configuration");
    return;
  }

  if (cfg.rateLimiting.redisUri) {
    try {
      // Lazy import to avoid requiring ioredis if not configured
      const { initRedisRateLimiter, consumePoint } = await import("../services/rateLimiter/redis");
      await initRedisRateLimiter(cfg.rateLimiting.redisUri!);
      redisConsume = consumePoint;
      useRedis = true;
      logger.info("Rate limiter initialized (redis-backed)");
      return;
    } catch (err) {
      logger.warn(
        "Failed to initialize redis rate limiter, falling back to in-memory",
        err as Error
      );
    }
  }

  logger.info("Rate limiter initialized (in-memory)");
}

/**
 * Middleware factory to rate-limit requests per-IP and per-route.
 * options.points = allowed requests per windowSecs
 */
export function rateLimit(options?: { points?: number; windowSecs?: number }) {
  const cfg = getConfig();
  const points = options?.points ?? cfg.rateLimiting.perIpLimit;
  const windowSecs = options?.windowSecs ?? cfg.rateLimiting.windowSecs;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!cfg.rateLimiting.enabled) return next();

    try {
      const ip = (req.ip || req.headers["x-forwarded-for"] || "unknown") as string;

      if (useRedis && redisConsume) {
        const { allowed, remaining, current } = await redisConsume(ip, points, windowSecs);
        if (!allowed) {
          logger.warn("Rate limit exceeded (redis)", {
            ip,
            path: req.path,
            method: req.method,
            current,
          });
          res.setHeader("Retry-After", String(windowSecs));
          res
            .status(429)
            .json({ error: ErrorCodes.RATE_LIMIT_EXCEEDED, message: "Too many requests" });
          return;
        }
        // continue
        return next();
      }

      const now = Math.floor(Date.now() / 1000);

      const bucket = ipBuckets.get(ip);
      if (!bucket) {
        ipBuckets.set(ip, { count: 1, windowStart: now });
        return next();
      }

      // If window expired, reset
      if (now - bucket.windowStart >= windowSecs) {
        ipBuckets.set(ip, { count: 1, windowStart: now });
        return next();
      }

      // Within window
      if (bucket.count + 1 > points) {
        // Too many requests
        logger.warn("Rate limit exceeded", { ip, path: req.path, method: req.method });
        res.setHeader("Retry-After", String(windowSecs - (now - bucket.windowStart)));
        res
          .status(429)
          .json({ error: ErrorCodes.RATE_LIMIT_EXCEEDED, message: "Too many requests" });
        return;
      }

      bucket.count += 1;
      ipBuckets.set(ip, bucket);
      return next();
    } catch (err) {
      logger.error("Rate limiter error", err as Error);
      next();
    }
  };
}

/** Utility to clear in-memory buckets (used in tests) */
export function clearRateLimiter(): void {
  ipBuckets.clear();
}
