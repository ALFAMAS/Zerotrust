/**
 * Account Lockout Middleware
 * In-memory store for failed login attempts and lockout state.
 */

import type { Request, Response, NextFunction } from "express";
import { getLogger } from "../logger";

const logger = getLogger("account-lockout");

interface LockoutEntry {
  count: number;
  lockedUntil?: Date;
  lastAttemptAt: Date;
}

// In-memory store: keyed by lowercase email
const failedAttempts = new Map<string, LockoutEntry>();

// Clean up stale entries every 10 minutes
setInterval(() => {
  const now = new Date();
  for (const [email, entry] of failedAttempts.entries()) {
    const staleMs = 60 * 60 * 1000; // 1 hour inactivity
    if (now.getTime() - entry.lastAttemptAt.getTime() > staleMs) {
      failedAttempts.delete(email);
    }
  }
}, 10 * 60 * 1000);

/**
 * Check if an account is currently locked.
 */
export function isAccountLocked(email: string): boolean {
  const key = email.toLowerCase();
  const entry = failedAttempts.get(key);
  if (!entry || !entry.lockedUntil) return false;
  if (entry.lockedUntil > new Date()) return true;
  // Lockout expired — clear it
  entry.lockedUntil = undefined;
  entry.count = 0;
  failedAttempts.set(key, entry);
  return false;
}

/**
 * Record a failed login attempt. Locks the account if threshold is reached.
 */
export function recordFailedLogin(
  email: string,
  settings: { threshold: number; durationMinutes: number }
): void {
  const key = email.toLowerCase();
  const now = new Date();
  const entry = failedAttempts.get(key) || { count: 0, lastAttemptAt: now };

  // If currently locked, don't increment
  if (entry.lockedUntil && entry.lockedUntil > now) return;

  entry.count += 1;
  entry.lastAttemptAt = now;

  if (entry.count >= settings.threshold) {
    entry.lockedUntil = new Date(now.getTime() + settings.durationMinutes * 60 * 1000);
    logger.warn("Account locked due to failed attempts", {
      email: key,
      attempts: entry.count,
      lockedUntil: entry.lockedUntil,
    });
  }

  failedAttempts.set(key, entry);
}

/**
 * Clear failed attempts on successful login.
 */
export function recordSuccessfulLogin(email: string): void {
  const key = email.toLowerCase();
  failedAttempts.delete(key);
}

/**
 * Express middleware that checks if an account is locked before proceeding.
 * Reads email from req.body.email.
 */
export function checkAccountLockout(req: Request, res: Response, next: NextFunction): void {
  const email = req.body?.email as string | undefined;
  if (!email) {
    next();
    return;
  }

  const key = email.toLowerCase();
  const entry = failedAttempts.get(key);

  if (entry?.lockedUntil && entry.lockedUntil > new Date()) {
    const retryAfterSeconds = Math.ceil((entry.lockedUntil.getTime() - Date.now()) / 1000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      error: "ACCOUNT_LOCKED",
      message: "Account is temporarily locked due to too many failed login attempts",
      retryAfter: retryAfterSeconds,
      lockedUntil: entry.lockedUntil.toISOString(),
    });
    return;
  }

  next();
}
