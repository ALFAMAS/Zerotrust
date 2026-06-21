import { createMiddleware } from "hono/factory";
import { getLogger } from "../logger";
import type { HonoEnv } from "../shared/types";

const logger = getLogger("account-lockout");

const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5", 10);
const LOCKOUT_DURATION_MS = parseInt(process.env.LOCKOUT_DURATION_MS || String(30 * 60 * 1000), 10);

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

interface LockoutEntry {
  count: number;
  lastAttemptAt: Date;
  lockedUntil?: Date;
}

const attemptMap = new Map<string, AttemptRecord>();
const failedAttempts = new Map<string, LockoutEntry>();

setInterval(
  () => {
    const now = new Date();
    for (const [email, entry] of failedAttempts.entries()) {
      if (now.getTime() - entry.lastAttemptAt.getTime() > 60 * 60 * 1000) {
        failedAttempts.delete(email);
      }
    }
  },
  10 * 60 * 1000
).unref();

export function isAccountLocked(email: string): { locked: boolean; lockedUntil?: string } {
  const key = email.toLowerCase();
  const entry = failedAttempts.get(key);
  if (!entry?.lockedUntil) return { locked: false };
  if (entry.lockedUntil > new Date())
    return { locked: true, lockedUntil: entry.lockedUntil.toISOString() };
  entry.lockedUntil = undefined;
  entry.count = 0;
  failedAttempts.set(key, entry);
  return { locked: false };
}

export function recordFailedLogin(
  email: string,
  settings?: { threshold: number; durationMinutes: number }
): void {
  const key = email.toLowerCase();
  const now = new Date();
  const threshold = settings?.threshold ?? MAX_ATTEMPTS;
  const durationMs = settings?.durationMinutes
    ? settings.durationMinutes * 60 * 1000
    : LOCKOUT_DURATION_MS;

  const entry = failedAttempts.get(key) || { count: 0, lastAttemptAt: now };

  if (entry.lockedUntil && entry.lockedUntil > now) return;

  entry.count += 1;
  entry.lastAttemptAt = now;

  if (entry.count >= threshold) {
    entry.lockedUntil = new Date(now.getTime() + durationMs);
    logger.warn("Account locked due to failed attempts", { email: key, attempts: entry.count });
  }

  failedAttempts.set(key, entry);
}

export function recordSuccessfulLogin(email: string): void {
  failedAttempts.delete(email.toLowerCase());
  attemptMap.delete(email);
}

export function checkAccountLockout() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const body = await c.req.json().catch(() => ({}));
    const email = body?.email as string | undefined;
    if (!email) return next();

    const key = email.toLowerCase();
    const entry = failedAttempts.get(key);

    if (entry?.lockedUntil && entry.lockedUntil > new Date()) {
      const retryAfterSeconds = Math.ceil((entry.lockedUntil.getTime() - Date.now()) / 1000);
      c.header("Retry-After", String(retryAfterSeconds));
      return c.json(
        {
          error: "ACCOUNT_LOCKED",
          message: "Account is temporarily locked due to too many failed login attempts",
          retryAfter: retryAfterSeconds,
          lockedUntil: entry.lockedUntil.toISOString(),
        },
        429
      );
    }

    return next();
  });
}

export function clearLockout(email: string): void {
  failedAttempts.delete(email.toLowerCase());
  attemptMap.delete(email);
}
