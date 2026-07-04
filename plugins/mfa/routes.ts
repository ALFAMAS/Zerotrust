import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../../src/db/index.js";
import { otpsTable, usersTable } from "../../src/db/schema/index.js";
import { getLogger } from "../../src/logger/index.js";
import { authMiddleware } from "../../src/middleware/auth.js";
import { sensitiveReverification } from "../../src/middleware/continuousVerification.js";
import { getSettings } from "../../src/models/settings.model.js";
import { sendOTP } from "../../src/services/auth/otpDelivery.service.js";
import { sendOtpEmail } from "../../src/services/notifications/email.service.js";
import { internalError } from "../../src/shared/httpErrors.js";
import type { HonoEnv, User } from "../../src/shared/types.js";

const router = new Hono<HonoEnv>();
const logger = getLogger("mfa-routes");

router.use("*", authMiddleware);

// POST /totp/setup
router.post("/totp/setup", async (c) => {
  try {
    const settings = await getSettings();
    if (!settings.totpEnabled) {
      return c.json({ error: "FEATURE_DISABLED", message: "TOTP is disabled" }, 403);
    }

    const user = c.get("user");
    const userId = user.id;
    const userEmail = user.email;
    const appName = settings.appName || "zerotrust";

    let secret: string;
    let qrCodeUrl: string;

    try {
      const { TOTP, Secret, URI } = await import("otpauth");
      const totpObj = new TOTP({
        issuer: appName,
        label: userEmail,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: new Secret({ size: 20 }),
      });
      secret = totpObj.secret.base32;
      const otpauthUri = URI.stringify(totpObj);
      const QRCode = await import("qrcode");
      qrCodeUrl = await QRCode.toDataURL(otpauthUri);
    } catch (libErr) {
      return internalError(c, logger, "TOTP library error", libErr, "TOTP setup failed");
    }

    const db = getDb();
    const userRows = await db
      .select({ mfa: usersTable.mfa })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const currentMfa = (userRows[0]?.mfa as User["mfa"] | null) ?? {
      totp: { enabled: false, backupCodes: [] },
      webauthn: { enabled: false },
    };

    await db
      .update(usersTable)
      .set({
        mfa: {
          ...currentMfa,
          totp: { ...currentMfa.totp, secret, enabled: false },
        },
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    return c.json({ secret, qrCodeUrl });
  } catch (err) {
    return internalError(c, logger, "TOTP setup error", err, "TOTP setup failed");
  }
});

// POST /totp/verify
router.post("/totp/verify", async (c) => {
  try {
    const settings = await getSettings();
    if (!settings.totpEnabled) {
      return c.json({ error: "FEATURE_DISABLED", message: "TOTP is disabled" }, 403);
    }

    const { code } = await c.req.json();
    if (!code) {
      return c.json({ error: "INVALID_REQUEST", message: "code is required" }, 400);
    }

    const userId = c.get("user").id;
    const db = getDb();
    const userRows = await db
      .select({ mfa: usersTable.mfa })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const user = userRows[0];
    const mfa = user?.mfa as User["mfa"] | undefined;

    if (!user || !mfa?.totp?.secret) {
      return c.json(
        {
          error: "TOTP_NOT_SETUP",
          message: "TOTP not set up yet. Call /totp/setup first",
        },
        400
      );
    }

    let valid = false;
    try {
      const { TOTP, Secret } = await import("otpauth");
      const totp = new TOTP({
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(mfa.totp.secret),
      });
      valid = totp.validate({ token: code, window: 1 }) !== null;
    } catch (libErr) {
      logger.error("TOTP verify library error", libErr as Error);
    }

    if (!valid) {
      return c.json({ error: "INVALID_CODE", message: "Invalid TOTP code" }, 401);
    }

    const alreadyEnabled =
      mfa.totp.enabled === true &&
      Array.isArray(mfa.totp.backupCodes) &&
      mfa.totp.backupCodes.length > 0;
    let backupCodes: string[] | undefined;
    let backupCodeHashes: string[] = mfa.totp.backupCodes ?? [];
    if (!alreadyEnabled) {
      backupCodes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString("hex"));
      backupCodeHashes = backupCodes.map((code) =>
        crypto.createHash("sha256").update(code.toLowerCase()).digest("hex")
      );
    }

    await db
      .update(usersTable)
      .set({
        mfa: {
          ...mfa,
          totp: {
            ...mfa.totp,
            enabled: true,
            verifiedAt: new Date(),
            backupCodes: backupCodeHashes,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    return c.json(backupCodes ? { enabled: true, backupCodes } : { enabled: true });
  } catch (err) {
    return internalError(c, logger, "TOTP verify error", err, "TOTP verification failed");
  }
});

// DELETE /totp
router.delete("/totp", sensitiveReverification, async (c) => {
  try {
    const userId = c.get("user").id;
    const db = getDb();
    const userRows = await db
      .select({ mfa: usersTable.mfa })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const currentMfa = (userRows[0]?.mfa as User["mfa"] | null) ?? {
      totp: { enabled: false, backupCodes: [] },
      webauthn: { enabled: false },
    };

    await db
      .update(usersTable)
      .set({
        mfa: {
          ...currentMfa,
          totp: {
            enabled: false,
            backupCodes: [],
            secret: undefined,
            verifiedAt: undefined,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    return c.json({ disabled: true });
  } catch (err) {
    return internalError(c, logger, "TOTP disable error", err, "Failed to disable TOTP");
  }
});

// POST /otp/send
router.post("/otp/send", async (c) => {
  try {
    const settings = await getSettings();
    const { channel } = await c.req.json();

    if (channel !== "email") {
      return c.json(
        {
          error: "INVALID_REQUEST",
          message: "channel must be 'email'",
        },
        400
      );
    }
    if (!settings.emailOtpEnabled) {
      return c.json({ error: "FEATURE_DISABLED", message: "Email OTP is disabled" }, 403);
    }

    const user = c.get("user");
    const target = user.email;

    const code = String(crypto.randomInt(100000, 999999));
    const db = getDb();

    await db.insert(otpsTable).values({
      userId: user.id,
      code,
      type: "login",
      channel,
      target,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    await sendOTP(channel, target, code);

    void sendOtpEmail(target, {
      name: user.displayName ?? user.email,
      code,
      expiresInMinutes: 10,
    });

    return c.json({ sent: true, channel });
  } catch (err) {
    return internalError(c, logger, "OTP send error", err, "Failed to send OTP");
  }
});

// POST /otp/verify
router.post("/otp/verify", async (c) => {
  try {
    const { channel, code } = await c.req.json();
    if (!channel || !code) {
      return c.json({ error: "INVALID_REQUEST", message: "channel and code are required" }, 400);
    }

    const userId = c.get("user").id;
    const db = getDb();
    const now = new Date();

    const records = await db
      .select()
      .from(otpsTable)
      .where(
        and(
          eq(otpsTable.userId, userId),
          eq(otpsTable.channel, channel),
          eq(otpsTable.type, "login"),
          eq(otpsTable.code, code),
          gt(otpsTable.expiresAt, now)
        )
      )
      .limit(1);

    if (records.length === 0) {
      return c.json({ error: "INVALID_CODE", message: "Invalid or expired OTP" }, 401);
    }

    await db.delete(otpsTable).where(eq(otpsTable.id, records[0].id));
    return c.json({ verified: true });
  } catch (err) {
    return internalError(c, logger, "OTP verify error", err, "OTP verification failed");
  }
});

export default router;
