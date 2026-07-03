import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getConfig } from "../../config";
import { getDb } from "../../db";
import { otpsTable, usersTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { sendOTP } from "../../mfa";
import { revokeAllSessionsForUser } from "../../middleware/sessionControl";
import { rateLimit } from "../../middleware/rateLimiting";
import { recordAndRespond } from "../../services/auth/accountTakeover.service";
import { rejectIfBreached } from "../../services/auth/passwordBreach.service";
import { sendPasswordResetEmail } from "../../services/notifications/email.service";
import { getClientIp } from "../../shared/clientIp";
import type { HonoEnv } from "../../shared/types";
import { ErrorCodes } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("password-reset-routes");

/**
 * Constant-time OTP comparison. Both inputs are normalized to a fixed-length
 * buffer first so a length mismatch (e.g. a malformed `code`) can't throw or
 * short-circuit into a timing side-channel.
 */
function safeCodeEquals(candidate: string, expected: string): boolean {
  const a = Buffer.from(String(candidate).padEnd(32, "\0"));
  const b = Buffer.from(String(expected).padEnd(32, "\0"));
  return crypto.timingSafeEqual(a, b);
}

// POST /request — send a password-reset OTP
router.post("/request", rateLimit({ points: 5, windowSecs: 3600 }), async (c) => {
  try {
    const { email } = (await c.req.json()) as { email: string };

    const db = getDb();
    const users = await db
      .select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    // Anti-enumeration: always return the same response whether user exists or not
    if (users.length === 0) {
      return c.json({ sent: true });
    }

    const user = users[0];

    // Invalidate any still-pending reset OTPs before issuing a new one so a
    // fresh request can't be used to spin up parallel attempt budgets (each
    // outstanding OTP would otherwise carry its own independent attempt
    // counter) and so an old, previously-emailed code stops working once a
    // newer one is requested.
    await db
      .delete(otpsTable)
      .where(and(eq(otpsTable.userId, user.id), eq(otpsTable.type, "password_reset")));

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(otpsTable).values({
      userId: user.id,
      code,
      type: "password_reset",
      channel: "email",
      target: user.email,
      expiresAt,
    });

    await sendOTP("email", user.email, code);

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const resetUrl = `${appUrl}/reset-password?email=${encodeURIComponent(user.email)}&code=${encodeURIComponent(code)}`;
    void sendPasswordResetEmail(user.email, {
      name: user.displayName ?? user.email,
      resetUrl,
      expiresInMinutes: 30,
    });

    return c.json({ sent: true });
  } catch (err) {
    logger.error("Password reset request error", err as Error);
    return c.json(
      {
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to process password reset request",
        details: [],
      },
      500
    );
  }
});

// POST /confirm — verify OTP and update password
router.post("/confirm", rateLimit({ points: 10, windowSecs: 900 }), async (c) => {
  try {
    const { email, code, newPassword } = (await c.req.json()) as {
      email: string;
      code: string;
      newPassword: string;
    };

    const db = getDb();

    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
      })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (users.length === 0) {
      return c.json(
        { code: ErrorCodes.INVALID_REQUEST, message: "Invalid email or code", details: [] },
        400
      );
    }

    const user = users[0];
    const now = new Date();
    const genericInvalid = () =>
      c.json(
        { code: ErrorCodes.INVALID_REQUEST, message: "Invalid or expired reset code", details: [] },
        400
      );

    // Find the live (unexpired, unused) reset OTP for this user. Deliberately
    // does NOT filter on `code` here — the comparison happens below, after
    // loading the row, so a wrong guess can be counted against `attempts`
    // instead of just returning zero rows with nothing to increment.
    const otps = await db
      .select()
      .from(otpsTable)
      .where(
        and(
          eq(otpsTable.userId, user.id),
          eq(otpsTable.type, "password_reset"),
          gt(otpsTable.expiresAt, now)
        )
      )
      .limit(1);

    const otp = otps.find((o) => o.usedAt === null);

    if (!otp) {
      return genericInvalid();
    }

    const cfg = getConfig();
    const maxAttempts = cfg.mfa.maxOTPAttempts;

    // Brute-force guard: once a code has been guessed wrong `maxAttempts`
    // times, burn it so the attacker can't keep spending guesses against the
    // same row — the user must request a fresh code (which itself is
    // rate-limited on /request).
    if (otp.attempts >= maxAttempts) {
      await db.delete(otpsTable).where(eq(otpsTable.id, otp.id));
      return genericInvalid();
    }

    if (!safeCodeEquals(code, otp.code)) {
      await db
        .update(otpsTable)
        .set({ attempts: sql`${otpsTable.attempts} + 1` })
        .where(eq(otpsTable.id, otp.id));
      return genericInvalid();
    }

    // HaveIBeenPwned breach check (k-anonymity — fails open on network errors)
    const breachMessage = await rejectIfBreached(newPassword);
    if (breachMessage) {
      return c.json({ code: "PASSWORD_BREACHED", message: breachMessage, details: [] }, 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, cfg.security.bcryptRounds);

    await db
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    await db.delete(otpsTable).where(eq(otpsTable.id, otp.id));

    // A successful password reset always ends every existing session — the
    // caller isn't authenticated in this flow, so there's no "current
    // session" to spare, and an attacker who had hijacked a live session
    // must not survive the legitimate owner's reset.
    await revokeAllSessionsForUser(user.id).catch((err) =>
      logger.error("Failed to revoke sessions after password reset", err as Error)
    );

    // Account takeover detection: password reset is a sensitive change —
    // combined with a recent email change it triggers an extra security
    // alert email (session revocation above is unconditional; this covers
    // the compound-attack alerting/audit path on top of it).
    void recordAndRespond(user.id, "password_reset", {
      email: user.email,
      displayName: user.displayName ?? user.email,
      ipAddress: getClientIp(c),
      userAgent: c.req.header("user-agent"),
    });

    return c.json({ success: true });
  } catch (err) {
    logger.error("Password reset confirm error", err as Error);
    return c.json(
      { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to reset password", details: [] },
      500
    );
  }
});

export default router;
