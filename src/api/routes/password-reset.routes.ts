import { Hono } from "hono";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { getDb } from "../../db";
import { usersTable, otpsTable } from "../../db/schema";
import { sendOTP } from "../../mfa";
import { getConfig } from "../../config";
import { getLogger } from "../../logger";
import { sendPasswordResetEmail } from "../../services/email.service";
import { ErrorCodes } from "../../shared/types";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("password-reset-routes");

// POST /request — send a password-reset OTP
router.post("/request", async (c) => {
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

    const appUrl = process.env.APP_URL ?? "http://localhost:3001";
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
router.post("/confirm", async (c) => {
  try {
    const { email, code, newPassword } = (await c.req.json()) as {
      email: string;
      code: string;
      newPassword: string;
    };

    const db = getDb();

    const users = await db
      .select({ id: usersTable.id })
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

    // Find a matching, unexpired, unused OTP with the correct code
    const otps = await db
      .select()
      .from(otpsTable)
      .where(
        and(
          eq(otpsTable.userId, user.id),
          eq(otpsTable.code, code),
          eq(otpsTable.type, "password_reset"),
          gt(otpsTable.expiresAt, now)
        )
      )
      .limit(1);

    const otp = otps.find((o) => o.usedAt === null);

    if (!otp) {
      return c.json(
        { code: ErrorCodes.INVALID_REQUEST, message: "Invalid or expired reset code", details: [] },
        400
      );
    }

    const cfg = getConfig();
    const passwordHash = await bcrypt.hash(newPassword, cfg.security.bcryptRounds);

    await db
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    await db.delete(otpsTable).where(eq(otpsTable.id, otp.id));

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
