import { createMiddleware } from "hono/factory";
import { getLogger } from "../logger";
import type { HonoEnv } from "../shared/types";

const logger = getLogger("account-lockout");

/** Base delay before the next login attempt after the first failure (ms). */
const BASE_DELAY_MS = parseInt(process.env.LOGIN_BACKOFF_BASE_MS || "1000", 10);
/** Cap on progressive delay (ms). Overridden by settings maxDelayMinutes when provided. */
const DEFAULT_MAX_DELAY_MS = parseInt(process.env.LOGIN_BACKOFF_MAX_MS || "60000", 10);
/** Failures after which proof-of-work is required (no hard lockout). */
const DEFAULT_POW_THRESHOLD = parseInt(process.env.LOGIN_POW_THRESHOLD || "8", 10);
/** Reset failure count after this idle window (ms). */
const FAILURE_WINDOW_MS = 60 * 60 * 1000;

interface AttemptRecord {
  count: number;
  lastAttemptAt: number;
  delayUntil?: number;
}

const failedAttempts = new Map<string, AttemptRecord>();

setInterval(
  () => {
    const now = Date.now();
    for (const [email, entry] of failedAttempts.entries()) {
      if (now - entry.lastAttemptAt > FAILURE_WINDOW_MS) {
        failedAttempts.delete(email);
      }
    }
  },
  10 * 60 * 1000
).unref();

export interface LoginBackoffSettings {
  /** When false, progressive backoff and PoW are skipped entirely. */
  enabled?: boolean;
  /** Failures before PoW is required (maps to platform accountLockoutThreshold). */
  powThreshold?: number;
  /** Max delay cap in minutes (maps to platform accountLockoutDurationMinutes). */
  maxDelayMinutes?: number;
}

function normalizeKey(email: string): string {
  return email.toLowerCase();
}

function maxDelayMs(settings?: LoginBackoffSettings): number {
  if (settings?.maxDelayMinutes != null && settings.maxDelayMinutes > 0) {
    return settings.maxDelayMinutes * 60 * 1000;
  }
  return DEFAULT_MAX_DELAY_MS;
}

function powThreshold(settings?: LoginBackoffSettings): number {
  return settings?.powThreshold ?? DEFAULT_POW_THRESHOLD;
}

/** Exponential backoff: 1s, 2s, 4s, … capped at maxDelayMs. Never hard-locks. */
export function computeBackoffDelayMs(
  failureCount: number,
  settings?: LoginBackoffSettings
): number {
  if (failureCount <= 0) return 0;
  const uncapped = BASE_DELAY_MS * 2 ** (failureCount - 1);
  return Math.min(uncapped, maxDelayMs(settings));
}

function getOrResetEntry(key: string): AttemptRecord | undefined {
  const entry = failedAttempts.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.lastAttemptAt > FAILURE_WINDOW_MS) {
    failedAttempts.delete(key);
    return undefined;
  }
  return entry;
}

export interface LoginThrottleState {
  /** True when the caller must wait before retrying (429). */
  delayed: boolean;
  retryAfterSeconds?: number;
  /** True when a valid PoW solution must accompany the login request. */
  requiresPow: boolean;
  failureCount: number;
}

export function getLoginThrottle(
  email: string,
  settings?: LoginBackoffSettings
): LoginThrottleState {
  if (settings?.enabled === false) {
    return { delayed: false, requiresPow: false, failureCount: 0 };
  }

  const key = normalizeKey(email);
  const entry = getOrResetEntry(key);
  if (!entry) {
    return { delayed: false, requiresPow: false, failureCount: 0 };
  }

  const threshold = powThreshold(settings);
  const requiresPow = entry.count >= threshold;
  const now = Date.now();

  if (entry.delayUntil && entry.delayUntil > now) {
    return {
      delayed: true,
      retryAfterSeconds: Math.ceil((entry.delayUntil - now) / 1000),
      requiresPow,
      failureCount: entry.count,
    };
  }

  return { delayed: false, requiresPow, failureCount: entry.count };
}

/** Backward-compatible alias — "locked" means a progressive delay is active, not a hard ban. */
export function isAccountLocked(
  email: string,
  settings?: LoginBackoffSettings
): { locked: boolean; lockedUntil?: string; requiresPow?: boolean } {
  const throttle = getLoginThrottle(email, settings);
  if (throttle.delayed && throttle.retryAfterSeconds) {
    return {
      locked: true,
      lockedUntil: new Date(Date.now() + throttle.retryAfterSeconds * 1000).toISOString(),
      requiresPow: throttle.requiresPow,
    };
  }
  return { locked: false, requiresPow: throttle.requiresPow };
}

export function recordFailedLogin(email: string, settings?: LoginBackoffSettings): void {
  if (settings?.enabled === false) return;

  const key = normalizeKey(email);
  const now = Date.now();
  const entry = getOrResetEntry(key) ?? { count: 0, lastAttemptAt: now };

  entry.count += 1;
  entry.lastAttemptAt = now;
  const delayMs = computeBackoffDelayMs(entry.count, settings);
  entry.delayUntil = delayMs > 0 ? now + delayMs : undefined;

  failedAttempts.set(key, entry);

  if (entry.count >= powThreshold(settings)) {
    logger.warn("Login failures require proof-of-work", { email: key, attempts: entry.count });
  } else if (delayMs > 0) {
    logger.info("Login progressive delay applied", {
      email: key,
      attempts: entry.count,
      delayMs,
    });
  }
}

export function recordSuccessfulLogin(email: string): void {
  failedAttempts.delete(normalizeKey(email));
}

export function checkAccountLockout() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const body = await c.req.json().catch(() => ({}));
    const email = body?.email as string | undefined;
    if (!email) return next();

    const throttle = getLoginThrottle(email);
    if (throttle.delayed && throttle.retryAfterSeconds) {
      c.header("Retry-After", String(throttle.retryAfterSeconds));
      return c.json(
        {
          error: "TOO_MANY_ATTEMPTS",
          message: "Too many failed login attempts. Please wait before trying again.",
          retryAfter: throttle.retryAfterSeconds,
          requiresPow: throttle.requiresPow,
        },
        429
      );
    }

    return next();
  });
}

export function clearLockout(email: string): void {
  failedAttempts.delete(normalizeKey(email));
}
