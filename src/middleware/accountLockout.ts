/**
 * Account lockout middleware.
 * Locks an account after N consecutive failed login attempts.
 * Stores attempt counts in memory (Redis-backed in production).
 */

import type { Request, Response, NextFunction } from "express";
import { UserModel } from "../models";
import { getLogger } from "../logger";
import { ErrorCodes } from "../shared/types";
import { sendOTP } from "../mfa";
import { getConfig } from "../config";

const logger = getLogger("account-lockout");

const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5");
const LOCKOUT_WINDOW_MS = parseInt(process.env.LOCKOUT_WINDOW_MS || String(15 * 60 * 1000));
const LOCKOUT_DURATION_MS = parseInt(process.env.LOCKOUT_DURATION_MS || String(30 * 60 * 1000));

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

const attemptMap = new Map<string, AttemptRecord>();

function getRecord(email: string): AttemptRecord {
  const existing = attemptMap.get(email);
  if (!existing) return { count: 0, firstAttemptAt: Date.now() };
  const now = Date.now();
  if (!existing.lockedUntil && now - existing.firstAttemptAt > LOCKOUT_WINDOW_MS) {
    attemptMap.delete(email);
    return { count: 0, firstAttemptAt: now };
  }
  return existing;
}

export function isAccountLocked(email: string): { locked: boolean; secondsRemaining?: number } {
  const record = getRecord(email);
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return {
      locked: true,
      secondsRemaining: Math.ceil((record.lockedUntil - Date.now()) / 1000),
    };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    attemptMap.delete(email);
  }
  return { locked: false };
}

export async function recordFailedLogin(email: string): Promise<void> {
  const record = getRecord(email);
  record.count += 1;
  attemptMap.set(email, record);

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    attemptMap.set(email, record);

    logger.warn("Account locked after failed login attempts", { email, attempts: record.count });

    try {
      const cfg = getConfig();
      if (cfg.mfa.channels.email.enabled) {
        const user = await UserModel.findOne({ email });
        if (user) {
          await sendOTP(
            "email",
            user.email,
            `Your ZeroAuth account has been temporarily locked after ${MAX_ATTEMPTS} failed login attempts. It will unlock in ${Math.round(LOCKOUT_DURATION_MS / 60000)} minutes. If this was not you, please contact support.`
          );
        }
      }
    } catch (err) {
      logger.warn("Failed to send lockout notification", { email });
    }
  }
}

export function recordSuccessfulLogin(email: string): void {
  attemptMap.delete(email);
}

export function checkAccountLockout(req: Request, res: Response, next: NextFunction): void {
  const email = req.body?.email as string | undefined;
  if (!email) return next();

  const { locked, secondsRemaining } = isAccountLocked(email);
  if (locked) {
    logger.warn("Blocked login attempt on locked account", { email });
    res.status(423).json({
      code: "ACCOUNT_LOCKED",
      message: `Account is temporarily locked. Try again in ${secondsRemaining} seconds.`,
      details: [{ field: "email", message: "Account locked due to too many failed attempts" }],
    });
    return;
  }
  next();
}

export function clearLockout(email: string): void {
  attemptMap.delete(email);
}
