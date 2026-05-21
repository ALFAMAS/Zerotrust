/**
 * Rate limiting middleware — in-memory pre-check → Redis fallback.
 * Per-IP sliding window with exponential backoff on repeat violations.
 */

import type { Request, Response, NextFunction } from "express";
import { getConfig } from "../config";
import { getLogger } from "../logger";
import { ErrorCodes } from "../shared/types";
import { consumeInMemory, isIpBanned } from "../services/rateLimiter/inmemory";
import { AuditModel } from "../models";

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
      AuditModel.create({
        action: "rate_limit.ip_banned",
        ipAddress: ip,
        userAgent: req.headers["user-agent"],
        success: false,
        errorCode: ErrorCodes.RATE_LIMIT_EXCEEDED,
        resourceDetails: { path: req.path, method: req.method, secondsRemaining: banCheck.seconds },
        timestamp: new Date(),
      }).catch(() => {});
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
      AuditModel.create({
        action: "rate_limit.exceeded",
        ipAddress: ip,
        userAgent: req.headers["user-agent"],
        success: false,
        errorCode: ErrorCodes.RATE_LIMIT_EXCEEDED,
        resourceDetails: { path: req.path, method: req.method, backend: "inmemory" },
        timestamp: new Date(),
      }).catch(() => {});
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
            AuditModel.create({
              action: "rate_limit.exceeded",
              ipAddress: ip,
              userAgent: req.headers["user-agent"],
              success: false,
              errorCode: ErrorCodes.RATE_LIMIT_EXCEEDED,
              resourceDetails: { path: req.path, method: req.method, backend: "redis", current },
              timestamp: new Date(),
            }).catch(() => {});
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

// ─── Multi-Tenant Rate Limiting ───────────────────────────────────────────────

interface TenantQuota {
  requestsPerMinute: number;
  burstAllowance: number;
}

const tenantQuotaMap = new Map<string, TenantQuota>();

/**
 * Store per-tenant quota configuration for use by tenantRateLimit().
 */
export function configureTenantQuota(
  tenantId: string,
  quota: { requestsPerMinute: number; burstAllowance?: number }
): void {
  tenantQuotaMap.set(tenantId, {
    requestsPerMinute: quota.requestsPerMinute,
    burstAllowance: quota.burstAllowance ?? Math.ceil(quota.requestsPerMinute * 0.2),
  });
}

/**
 * Retrieve the stored quota for a tenant, or null if not configured.
 */
export function getTenantQuota(tenantId: string): TenantQuota | null {
  return tenantQuotaMap.get(tenantId) ?? null;
}

/**
 * Rate-limit middleware that uses tenantId as the primary namespace.
 * Falls back to IP-based limiting when tenantId is not present.
 * Per-tenant quotas set via configureTenantQuota() override opts.max.
 */
export function tenantRateLimit(opts: { windowMs: number; max: number; message?: string }) {
  const windowSecs = Math.ceil(opts.windowMs / 1000);
  const defaultMax = opts.max;
  const message = opts.message ?? "Too many requests";

  return (req: Request, res: Response, next: NextFunction): void => {
    const cfg = getConfig();
    if (!cfg.rateLimiting.enabled) return next();

    const tenantId: string | undefined = (req as any).tenantId;

    // Determine effective key and point limit
    let key: string;
    let points: number;

    if (tenantId) {
      const storedQuota = tenantQuotaMap.get(tenantId);
      points = storedQuota ? storedQuota.requestsPerMinute : defaultMax;
      key = `tenant:${tenantId}`;
    } else {
      points = defaultMax;
      const ip = ((req.headers["x-forwarded-for"] as string) || req.ip || "unknown")
        .split(",")[0]
        .trim();
      key = `ip:${ip}`;
    }

    const inMemResult = consumeInMemory(key, 1, points, windowSecs);
    if (!inMemResult.allowed) {
      logger.warn("Tenant rate limit exceeded (in-memory)", {
        key,
        path: req.path,
        method: req.method,
      });
      AuditModel.create({
        action: "rate_limit.exceeded",
        ipAddress: (req.headers["x-forwarded-for"] as string | undefined) ?? req.ip,
        userAgent: req.headers["user-agent"],
        success: false,
        errorCode: ErrorCodes.RATE_LIMIT_EXCEEDED,
        resourceDetails: { path: req.path, method: req.method, backend: "inmemory", key },
        timestamp: new Date(),
      }).catch(() => {});
      const retryAfter = inMemResult.banSeconds ?? windowSecs;
      res.setHeader("Retry-After", String(retryAfter));
      res
        .status(429)
        .json({ code: ErrorCodes.RATE_LIMIT_EXCEEDED, message, details: [] });
      return;
    }

    if (useRedis && redisConsume) {
      redisConsume(key, 1, windowSecs)
        .then(({ allowed, current }) => {
          if (!allowed) {
            logger.warn("Tenant rate limit exceeded (redis)", {
              key,
              path: req.path,
              method: req.method,
              current,
            });
            AuditModel.create({
              action: "rate_limit.exceeded",
              ipAddress: (req.headers["x-forwarded-for"] as string | undefined) ?? req.ip,
              userAgent: req.headers["user-agent"],
              success: false,
              errorCode: ErrorCodes.RATE_LIMIT_EXCEEDED,
              resourceDetails: {
                path: req.path,
                method: req.method,
                backend: "redis",
                key,
                current,
              },
              timestamp: new Date(),
            }).catch(() => {});
            res.setHeader("Retry-After", String(windowSecs));
            res.status(429).json({ code: ErrorCodes.RATE_LIMIT_EXCEEDED, message, details: [] });
            return;
          }
          next();
        })
        .catch((err) => {
          logger.error("Redis tenant rate limiter error, passing through", err as Error);
          next();
        });
      return;
    }

    next();
  };
}
