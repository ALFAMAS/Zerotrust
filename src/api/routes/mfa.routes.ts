import { Hono } from "hono";
import crypto from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { getDb } from "../../db";
import { usersTable, otpsTable } from "../../db/schema";
import { authMiddleware } from "../../middleware/auth";
import { getSettings } from "../../models/settings.model";
import { sendOTP } from "../../mfa";
import { getLogger } from "../../logger";
import { sendOtpEmail } from "../../services/email.service";
import type { HonoEnv } from "../../shared/types";

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
    const appName = settings.appName || "ZeroAuth";

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
      logger.error("TOTP library error", libErr as Error);
      return c.json({ error: "INTERNAL_ERROR", message: "TOTP setup failed" }, 500);
    }

    const db = getDb();
    const userRows = await db
      .select({ mfa: usersTable.mfa })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const currentMfa = (userRows[0]?.mfa as any) ?? {
      totp: { enabled: false, backupCodes: [] },
      webauthn: { enabled: false },
    };

    await db
      .update(usersTable)
      .set({
        mfa: { ...currentMfa, totp: { ...currentMfa.totp, secret, enabled: false } },
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    return c.json({ secret, qrCodeUrl });
  } catch (err) {
    logger.error("TOTP setup error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "TOTP setup failed" }, 500);
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
    const mfa = user?.mfa as any;

    if (!user || !mfa?.totp?.secret) {
      return c.json(
        { error: "TOTP_NOT_SETUP", message: "TOTP not set up yet. Call /totp/setup first" },
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

    // Generate one-time recovery codes the first time TOTP is enabled so a user
    // who loses their authenticator can still get in. They are shown ONCE here
    // and stored only as sha256 hashes; redeemed at POST /auth/login/mfa.
    const alreadyEnabled = mfa.totp.enabled === true && Array.isArray(mfa.totp.backupCodes) && mfa.totp.backupCodes.length > 0;
    let backupCodes: string[] | undefined;
    let backupCodeHashes: string[] = mfa.totp.backupCodes ?? [];
    if (!alreadyEnabled) {
      backupCodes = Array.from({ length: 10 }, () =>
        crypto.randomBytes(5).toString("hex") // 10 hex chars per code
      );
      backupCodeHashes = backupCodes.map((code) =>
        crypto.createHash("sha256").update(code.toLowerCase()).digest("hex")
      );
    }

    await db
      .update(usersTable)
      .set({
        mfa: {
          ...mfa,
          totp: { ...mfa.totp, enabled: true, verifiedAt: new Date(), backupCodes: backupCodeHashes },
        },
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    return c.json(backupCodes ? { enabled: true, backupCodes } : { enabled: true });
  } catch (err) {
    logger.error("TOTP verify error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "TOTP verification failed" }, 500);
  }
});

// DELETE /totp
router.delete("/totp", async (c) => {
  try {
    const userId = c.get("user").id;
    const db = getDb();
    const userRows = await db
      .select({ mfa: usersTable.mfa })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const currentMfa = (userRows[0]?.mfa as any) ?? {
      totp: { enabled: false, backupCodes: [] },
      webauthn: { enabled: false },
    };

    await db
      .update(usersTable)
      .set({
        mfa: {
          ...currentMfa,
          totp: { enabled: false, backupCodes: [], secret: undefined, verifiedAt: undefined },
        },
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    return c.json({ disabled: true });
  } catch (err) {
    logger.error("TOTP disable error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to disable TOTP" }, 500);
  }
});

// POST /otp/send
router.post("/otp/send", async (c) => {
  try {
    const settings = await getSettings();
    const { channel } = await c.req.json();

    if (!channel || !["email", "sms"].includes(channel)) {
      return c.json({ error: "INVALID_REQUEST", message: "channel must be 'email' or 'sms'" }, 400);
    }
    if (channel === "email" && !settings.emailOtpEnabled) {
      return c.json({ error: "FEATURE_DISABLED", message: "Email OTP is disabled" }, 403);
    }
    if (channel === "sms" && !settings.smsOtpEnabled) {
      return c.json({ error: "FEATURE_DISABLED", message: "SMS OTP is disabled" }, 403);
    }

    const user = c.get("user");
    const target = channel === "email" ? user.email : user.phone || "";

    if (channel === "sms" && !target) {
      return c.json({ error: "NO_PHONE", message: "No phone number on account" }, 400);
    }

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

    if (channel === "email") {
      void sendOtpEmail(target, {
        name: user.displayName ?? user.email,
        code,
        expiresInMinutes: 10,
      });
    }

    return c.json({ sent: true, channel });
  } catch (err) {
    logger.error("OTP send error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Failed to send OTP" }, 500);
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
    logger.error("OTP verify error", err as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "OTP verification failed" }, 500);
  }
});

export default router;
