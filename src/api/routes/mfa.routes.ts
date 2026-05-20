import express from "express";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { authMiddleware } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rateLimiting";
import { validate } from "../../middleware/validation";
import {
  TOTPVerifySchema,
  BackupCodeRedeemSchema,
  MFASendOTPSchema,
  MFAVerifyOTPSchema,
} from "../schemas/mfa.schema";
import { UserModel, OTPModel } from "../../models";
import { sendOTP } from "../../mfa";
import { getConfig } from "../../config";
import { getLogger } from "../../logger";
import { ErrorCodes } from "../../shared/types";
import * as crypto from "crypto";

const router = express.Router();
const logger = getLogger("mfa-routes");

function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => crypto.randomBytes(5).toString("hex").toUpperCase());
}

router.post(
  "/totp/setup",
  rateLimit({ points: 10, windowSecs: 60 }),
  authMiddleware,
  async (req, res) => {
    try {
      const user = await UserModel.findById(req.user!._id);
      if (!user)
        return res
          .status(404)
          .json({ code: ErrorCodes.USER_NOT_FOUND, message: "User not found", details: [] });

      if (user.mfa?.totp?.enabled) {
        return res
          .status(409)
          .json({ code: "TOTP_ALREADY_ENABLED", message: "TOTP is already enabled", details: [] });
      }

      const secret = new OTPAuth.Secret({ size: 20 });
      const totp = new OTPAuth.TOTP({
        issuer: "ZeroAuth",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret,
      });

      const otpAuthUrl = totp.toString();
      const qrDataUrl = await QRCode.toDataURL(otpAuthUrl);

      user.mfa = user.mfa || {
        totp: { enabled: false, backupCodes: [] },
        webauthn: { enabled: false },
      };
      user.mfa.totp.secret = secret.base32;
      user.mfa.totp.enabled = false;
      await user.save();

      res.json({
        secret: secret.base32,
        otpAuthUrl,
        qrDataUrl,
        message: "Scan QR code and verify with /mfa/totp/verify to activate",
      });
    } catch (err) {
      logger.error("TOTP setup error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "TOTP setup failed", details: [] });
    }
  }
);

router.post(
  "/totp/verify",
  rateLimit({ points: 10, windowSecs: 60 }),
  authMiddleware,
  validate(TOTPVerifySchema),
  async (req, res) => {
    try {
      const { code } = req.body as any;
      const user = await UserModel.findById(req.user!._id);
      if (!user)
        return res
          .status(404)
          .json({ code: ErrorCodes.USER_NOT_FOUND, message: "User not found", details: [] });

      if (!user.mfa?.totp?.secret) {
        return res.status(400).json({
          code: "TOTP_NOT_SETUP",
          message: "TOTP not configured. Call /mfa/totp/setup first",
          details: [],
        });
      }

      const cfg = getConfig();
      const totp = new OTPAuth.TOTP({
        issuer: "ZeroAuth",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.mfa.totp.secret),
      });

      const delta = totp.validate({ token: code, window: cfg.mfa.totpWindow });
      if (delta === null) {
        return res
          .status(400)
          .json({ code: ErrorCodes.MFA_INVALID, message: "Invalid TOTP code", details: [] });
      }

      const backupCodes = generateBackupCodes(8);
      const hashedCodes = backupCodes.map((c) =>
        crypto.createHash("sha256").update(c).digest("hex")
      );

      user.mfa.totp.enabled = true;
      user.mfa.totp.backupCodes = hashedCodes;
      user.mfa.totp.verifiedAt = new Date();
      await user.save();

      res.json({
        success: true,
        backupCodes,
        message: "TOTP enabled. Store backup codes securely — they will not be shown again.",
      });
    } catch (err) {
      logger.error("TOTP verify error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "TOTP verification failed",
        details: [],
      });
    }
  }
);

router.post(
  "/totp/disable",
  rateLimit({ points: 5, windowSecs: 60 }),
  authMiddleware,
  validate(TOTPVerifySchema),
  async (req, res) => {
    try {
      const { code } = req.body as any;
      const user = await UserModel.findById(req.user!._id);
      if (!user)
        return res
          .status(404)
          .json({ code: ErrorCodes.USER_NOT_FOUND, message: "User not found", details: [] });

      if (!user.mfa?.totp?.enabled) {
        return res
          .status(400)
          .json({ code: "TOTP_NOT_ENABLED", message: "TOTP is not enabled", details: [] });
      }

      const cfg = getConfig();
      const totp = new OTPAuth.TOTP({
        issuer: "ZeroAuth",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.mfa.totp.secret!),
      });

      const delta = totp.validate({ token: code, window: cfg.mfa.totpWindow });
      if (delta === null) {
        return res
          .status(400)
          .json({ code: ErrorCodes.MFA_INVALID, message: "Invalid TOTP code", details: [] });
      }

      user.mfa.totp.enabled = false;
      user.mfa.totp.secret = undefined;
      user.mfa.totp.backupCodes = [];
      await user.save();

      res.json({ success: true });
    } catch (err) {
      logger.error("TOTP disable error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "TOTP disable failed", details: [] });
    }
  }
);

router.post(
  "/backup-codes/regenerate",
  rateLimit({ points: 5, windowSecs: 60 }),
  authMiddleware,
  validate(TOTPVerifySchema),
  async (req, res) => {
    try {
      const { code } = req.body as any;
      const user = await UserModel.findById(req.user!._id);
      if (!user)
        return res
          .status(404)
          .json({ code: ErrorCodes.USER_NOT_FOUND, message: "User not found", details: [] });

      if (!user.mfa?.totp?.enabled) {
        return res.status(400).json({
          code: "TOTP_NOT_ENABLED",
          message: "TOTP must be enabled to regenerate backup codes",
          details: [],
        });
      }

      const cfg = getConfig();
      const totp = new OTPAuth.TOTP({
        issuer: "ZeroAuth",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.mfa.totp.secret!),
      });

      const delta = totp.validate({ token: code, window: cfg.mfa.totpWindow });
      if (delta === null) {
        return res
          .status(400)
          .json({ code: ErrorCodes.MFA_INVALID, message: "Invalid TOTP code", details: [] });
      }

      const backupCodes = generateBackupCodes(8);
      const hashedCodes = backupCodes.map((c) =>
        crypto.createHash("sha256").update(c).digest("hex")
      );
      user.mfa.totp.backupCodes = hashedCodes;
      await user.save();

      res.json({
        backupCodes,
        message: "New backup codes generated. Previous codes are now invalid.",
      });
    } catch (err) {
      logger.error("Backup code regenerate error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to regenerate backup codes",
        details: [],
      });
    }
  }
);

router.post(
  "/backup-codes/redeem",
  rateLimit({ points: 10, windowSecs: 60 }),
  validate(BackupCodeRedeemSchema),
  async (req, res) => {
    try {
      const { code } = req.body as any;
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res
          .status(401)
          .json({ code: ErrorCodes.TOKEN_INVALID, message: "Authorization required", details: [] });
      }

      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      const user = await UserModel.findOne({ "mfa.totp.backupCodes": codeHash });
      if (!user) {
        return res
          .status(401)
          .json({ code: ErrorCodes.MFA_INVALID, message: "Invalid backup code", details: [] });
      }

      user.mfa.totp.backupCodes = user.mfa.totp.backupCodes.filter((c) => c !== codeHash);
      await user.save();

      res.json({
        success: true,
        remainingCodes: user.mfa.totp.backupCodes.length,
        message: "Backup code redeemed. You are now authenticated.",
      });
    } catch (err) {
      logger.error("Backup code redeem error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to redeem backup code",
        details: [],
      });
    }
  }
);

router.post(
  "/otp/send",
  rateLimit({ points: 5, windowSecs: 60 }),
  authMiddleware,
  validate(MFASendOTPSchema),
  async (req, res) => {
    try {
      const { channel, target } = req.body as any;
      const cfg = getConfig();
      const channelCfg = cfg.mfa.channels[channel as keyof typeof cfg.mfa.channels];
      if (!channelCfg?.enabled) {
        return res.status(400).json({
          code: "CHANNEL_DISABLED",
          message: `MFA channel ${channel} is not enabled`,
          details: [],
        });
      }

      const code = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + cfg.mfa.otpExpirySecs * 1000);

      await OTPModel.create({
        userId: req.user!._id,
        code: crypto.createHash("sha256").update(code).digest("hex"),
        type: "login",
        channel,
        target,
        expiresAt,
        attempts: 0,
      });

      await sendOTP(channel, target, code);
      res.json({ success: true, expiresIn: cfg.mfa.otpExpirySecs });
    } catch (err) {
      logger.error("OTP send error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "Failed to send OTP", details: [] });
    }
  }
);

router.post(
  "/otp/verify",
  rateLimit({ points: 10, windowSecs: 60 }),
  authMiddleware,
  validate(MFAVerifyOTPSchema),
  async (req, res) => {
    try {
      const { code, channel } = req.body as any;
      const cfg = getConfig();

      const otp = await OTPModel.findOne({
        userId: req.user!._id,
        channel,
        type: "login",
        expiresAt: { $gt: new Date() },
        usedAt: { $exists: false },
        attempts: { $lt: cfg.mfa.maxOTPAttempts },
      }).sort({ createdAt: -1 });

      if (!otp) {
        return res.status(400).json({
          code: ErrorCodes.MFA_INVALID,
          message: "No valid OTP found. Request a new one.",
          details: [],
        });
      }

      otp.attempts += 1;
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");

      if (otp.code !== codeHash) {
        await otp.save();
        return res
          .status(400)
          .json({ code: ErrorCodes.MFA_INVALID, message: "Invalid OTP code", details: [] });
      }

      otp.usedAt = new Date();
      await otp.save();

      res.json({ success: true, verified: true });
    } catch (err) {
      logger.error("OTP verify error", err as Error);
      res
        .status(500)
        .json({ code: ErrorCodes.INTERNAL_ERROR, message: "OTP verification failed", details: [] });
    }
  }
);

export default router;
