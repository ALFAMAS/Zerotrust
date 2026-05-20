/**
 * Rate limiting middleware — in-memory pre-check → Redis fallback.
 * Per-IP sliding window with exponential backoff on repeat violations.
 */

import type { Request, Response, NextFunction } from "express";
import { getConfig } from "../config";
import { getLogger } from "../logger";
import { ErrorCodes } from "../shared/types";
import { consumeInMemory, isIpBanned } from "../services/rateLimiter/inmemory";

let useRedis = false as boolean;
let redisConsume:
  | ((
      key: string,
      points: number,
      windowSecs: number
    ) => Promise<{ allowed: boolean; remaining: number; current: number }>)
  | null = null;

const logger = getLogger("rate-limiter");

export async function initRateLimiter(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.rateLimiting.enabled) {
    logger.info("Rate limiting disabled by configuration");
    return;
  }

  if (cfg.rateLimiting.redisUri) {
    try {
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

export function rateLimit(options?: { points?: number; windowSecs?: number }) {
  const cfg = getConfig();
  const points = options?.points ?? cfg.rateLimiting.perIpLimit;
  const windowSecs = options?.windowSecs ?? cfg.rateLimiting.windowSecs;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!cfg.rateLimiting.enabled) return next();

    const ip = ((req.headers["x-forwarded-for"] as string) || req.ip || "unknown")
      .split(",")[0]
      .trim();

    const banCheck = isIpBanned(ip);
    if (banCheck.banned) {
      logger.warn("Banned IP attempted request", {
        ip,
        path: req.path,
        secondsRemaining: banCheck.seconds,
      });
      res.setHeader("Retry-After", String(banCheck.seconds));
      res.status(429).json({
        code: ErrorCodes.RATE_LIMIT_EXCEEDED,
        message: "Too many requests — IP temporarily banned",
        details: [],
      });
      return;
    }

    const inMemResult = consumeInMemory(ip, 1, points, windowSecs);
    if (!inMemResult.allowed) {
      logger.warn("Rate limit exceeded (in-memory pre-check)", {
        ip,
        path: req.path,
        method: req.method,
      });
      const retryAfter = inMemResult.banSeconds ?? windowSecs;
      res.setHeader("Retry-After", String(retryAfter));
      res
        .status(429)
        .json({ code: ErrorCodes.RATE_LIMIT_EXCEEDED, message: "Too many requests", details: [] });
      return;
    }

    if (useRedis && redisConsume) {
      redisConsume(ip, 1, windowSecs)
        .then(({ allowed, current }) => {
          if (!allowed) {
            logger.warn("Rate limit exceeded (redis)", {
              ip,
              path: req.path,
              method: req.method,
              current,
            });
            res.setHeader("Retry-After", String(windowSecs));
            res.status(429).json({
              code: ErrorCodes.RATE_LIMIT_EXCEEDED,
              message: "Too many requests",
              details: [],
            });
            return;
          }
          next();
        })
        .catch((err) => {
          logger.error("Redis rate limiter error, passing through", err as Error);
          next();
        });
      return;
    }

    next();
  };
}

export function clearRateLimiter(): void {
  const { clearInMemoryBuckets } = require("../services/rateLimiter/inmemory");
  clearInMemoryBuckets();
}
