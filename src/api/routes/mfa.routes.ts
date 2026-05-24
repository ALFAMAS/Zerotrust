import express from "express";
import crypto from "crypto";
import { authMiddleware } from "../../middleware/auth";
import { getSettings } from "../../models/settings.model";
import { UserModel, OTPModel } from "../../models";
import { sendOTP } from "../../mfa";
import { getLogger } from "../../logger";
import { nanoid } from "nanoid";

const router = express.Router();
const logger = getLogger("mfa-routes");

// All MFA routes require authentication
router.use(authMiddleware);

// ─── TOTP ───────────────────────────────────────────────────────────────────

// POST /totp/setup — generate TOTP secret and QR code
router.post("/totp/setup", async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.totpEnabled) {
      return res.status(403).json({ error: "FEATURE_DISABLED", message: "TOTP is disabled" });
    }

    const userId = req.user!._id!.toString();
    const userEmail = req.user!.email;
    const appName = settings.appName || "ZeroAuth";

    // Use otpauth (available as "otpauth" in package.json)
    let secret: string;
    let qrCodeUrl: string;

    try {
      const { TOTP, URI, Secret } = await import("otpauth");
      const totp = new TOTP({
        issuer: appName,
        label: userEmail,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: new Secret(),
      });

      secret = totp.secret.base32;
      const otpauthUri = URI.stringify(totp);

      const QRCode = await import("qrcode");
      qrCodeUrl = await QRCode.toDataURL(otpauthUri);
    } catch (libErr) {
      logger.error("TOTP library error", libErr as Error);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "TOTP setup failed" });
    }

    // Store secret on user (not yet enabled — enable after verify)
    await UserModel.findByIdAndUpdate(userId, {
      "mfa.totp.secret": secret,
      "mfa.totp.enabled": false,
    });

    return res.status(200).json({ secret, qrCodeUrl });
  } catch (err) {
    logger.error("TOTP setup error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "TOTP setup failed" });
  }
});

// POST /totp/verify — verify code and enable TOTP
router.post("/totp/verify", async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.totpEnabled) {
      return res.status(403).json({ error: "FEATURE_DISABLED", message: "TOTP is disabled" });
    }

    const { code } = req.body as { code?: string };
    if (!code) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "code is required" });
    }

    const userId = req.user!._id!.toString();
    const user = await UserModel.findById(userId);
    if (!user || !user.mfa?.totp?.secret) {
      return res.status(400).json({ error: "TOTP_NOT_SETUP", message: "TOTP not set up yet. Call /totp/setup first" });
    }

    let valid = false;
    try {
      const { TOTP, Secret } = await import("otpauth");
      const totp = new TOTP({
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(user.mfa.totp.secret),
      });
      const delta = totp.validate({ token: code, window: 1 });
      valid = delta !== null;
    } catch (libErr) {
      logger.error("TOTP verify library error", libErr as Error);
    }

    if (!valid) {
      return res.status(401).json({ error: "INVALID_CODE", message: "Invalid TOTP code" });
    }

    await UserModel.findByIdAndUpdate(userId, {
      "mfa.totp.enabled": true,
      "mfa.totp.verifiedAt": new Date(),
    });

    return res.status(200).json({ enabled: true });
  } catch (err) {
    logger.error("TOTP verify error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "TOTP verification failed" });
  }
});

// DELETE /totp — disable TOTP
router.delete("/totp", async (req, res) => {
  try {
    const userId = req.user!._id!.toString();
    await UserModel.findByIdAndUpdate(userId, {
      "mfa.totp.enabled": false,
      "mfa.totp.secret": undefined,
      "mfa.totp.verifiedAt": undefined,
    });
    return res.status(200).json({ disabled: true });
  } catch (err) {
    logger.error("TOTP disable error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to disable TOTP" });
  }
});

// ─── OTP (email / SMS) ───────────────────────────────────────────────────────

// POST /otp/send — send OTP via email or SMS
router.post("/otp/send", async (req, res) => {
  try {
    const settings = await getSettings();
    const { channel } = req.body as { channel?: "email" | "sms" };

    if (!channel || !["email", "sms"].includes(channel)) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "channel must be 'email' or 'sms'" });
    }

    if (channel === "email" && !settings.emailOtpEnabled) {
      return res.status(403).json({ error: "FEATURE_DISABLED", message: "Email OTP is disabled" });
    }
    if (channel === "sms" && !settings.smsOtpEnabled) {
      return res.status(403).json({ error: "FEATURE_DISABLED", message: "SMS OTP is disabled" });
    }

    const user = req.user!;
    const userId = user._id!.toString();
    const target = channel === "email" ? user.email : (user.phone || "");

    if (channel === "sms" && !target) {
      return res.status(400).json({ error: "NO_PHONE", message: "No phone number on account" });
    }

    // Generate 6-digit OTP
    const code = String(crypto.randomInt(100000, 999999));

    await OTPModel.create({
      userId,
      code,
      type: "login",
      channel,
      target,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    await sendOTP(channel, target, code);

    return res.status(200).json({ sent: true, channel });
  } catch (err) {
    logger.error("OTP send error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to send OTP" });
  }
});

// POST /otp/verify — verify OTP code
router.post("/otp/verify", async (req, res) => {
  try {
    const { channel, code } = req.body as { channel?: "email" | "sms"; code?: string };

    if (!channel || !code) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "channel and code are required" });
    }

    const userId = req.user!._id!.toString();

    const record = await OTPModel.findOne({
      userId,
      channel,
      type: "login",
      code,
      expiresAt: { $gt: new Date() },
    });

    if (!record) {
      return res.status(401).json({ error: "INVALID_CODE", message: "Invalid or expired OTP" });
    }

    // Single-use: delete record
    await OTPModel.deleteOne({ _id: record._id });

    return res.status(200).json({ verified: true });
  } catch (err) {
    logger.error("OTP verify error", err as Error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "OTP verification failed" });
  }
});

export default router;
