import express from "express";
import bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { rateLimit } from "../../middleware/rateLimiting";
import { validate } from "../../middleware/validation";
import { PasswordResetRequestSchema, PasswordResetConfirmSchema } from "../schemas/auth.schema";
import { UserModel, OTPModel } from "../../models";
import { sendOTP } from "../../mfa";
import { getConfig } from "../../config";
import { getLogger } from "../../logger";
import { ErrorCodes } from "../../shared/types";

const router = express.Router();
const logger = getLogger("password-reset-routes");

router.post(
  "/request",
  rateLimit({ points: 5, windowSecs: 60 }),
  validate(PasswordResetRequestSchema),
  async (req, res) => {
    try {
      const { email, channel } = req.body as any;

      const user = await UserModel.findOne({ email });
      if (!user) {
        return res.json({ success: true, message: "If that email exists, a reset code was sent." });
      }

      const cfg = getConfig();
      const channelCfg = cfg.mfa.channels[channel as keyof typeof cfg.mfa.channels];
      if (!channelCfg?.enabled) {
        return res.status(400).json({
          code: "CHANNEL_DISABLED",
          message: `Channel ${channel} is not enabled`,
          details: [],
        });
      }

      await OTPModel.deleteMany({ userId: user._id, type: "password_reset" });

      const code = crypto.randomInt(100000, 999999).toString();
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      const expiresAt = new Date(Date.now() + cfg.mfa.otpExpirySecs * 1000);

      await OTPModel.create({
        userId: user._id,
        code: codeHash,
        type: "password_reset",
        channel,
        target: channel === "email" ? user.email : req.body.target || user.email,
        expiresAt,
        attempts: 0,
      });

      await sendOTP(channel, channel === "email" ? user.email : req.body.target, code);

      res.json({
        success: true,
        message: "If that email exists, a reset code was sent.",
        expiresIn: cfg.mfa.otpExpirySecs,
      });
    } catch (err) {
      logger.error("Password reset request error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to process password reset request",
        details: [],
      });
    }
  }
);

router.post(
  "/confirm",
  rateLimit({ points: 10, windowSecs: 60 }),
  validate(PasswordResetConfirmSchema),
  async (req, res) => {
    try {
      const { email, code, newPassword } = req.body as any;

      const user = await UserModel.findOne({ email });
      if (!user) {
        return res.status(400).json({
          code: ErrorCodes.INVALID_REQUEST,
          message: "Invalid email or code",
          details: [],
        });
      }

      const cfg = getConfig();
      const otp = await OTPModel.findOne({
        userId: user._id,
        type: "password_reset",
        expiresAt: { $gt: new Date() },
        usedAt: { $exists: false },
        attempts: { $lt: cfg.mfa.maxOTPAttempts },
      }).sort({ createdAt: -1 });

      if (!otp) {
        return res.status(400).json({
          code: ErrorCodes.INVALID_REQUEST,
          message: "Invalid or expired reset code",
          details: [],
        });
      }

      otp.attempts += 1;
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");

      if (otp.code !== codeHash) {
        await otp.save();
        return res
          .status(400)
          .json({ code: ErrorCodes.INVALID_REQUEST, message: "Invalid reset code", details: [] });
      }

      otp.usedAt = new Date();
      await otp.save();

      const passwordHash = await bcrypt.hash(newPassword, cfg.security.bcryptRounds);
      await UserModel.findByIdAndUpdate(user._id, { passwordHash });

      res.json({
        success: true,
        message: "Password updated successfully. Please log in with your new password.",
      });
    } catch (err) {
      logger.error("Password reset confirm error", err as Error);
      res.status(500).json({
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to reset password",
        details: [],
      });
    }
  }
);

export default router;
