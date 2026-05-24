import crypto from "crypto";
import nodemailer from "nodemailer";
import { OTPModel } from "../models";
import { UserModel } from "../models/user.model";
import { getSettings } from "../models/settings.model";
import { getLogger } from "../logger";

const logger = getLogger("magic-link");
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

let _transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST;
  if (host) {
    _transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER || process.env.MAIL_USER
          ? {
              user: process.env.SMTP_USER || process.env.MAIL_USER,
              pass: process.env.SMTP_PASS || process.env.MAIL_PASS,
            }
          : undefined,
    } as any);
  } else {
    _transporter = nodemailer.createTransport({ jsonTransport: true } as any);
  }
  return _transporter;
}

export async function sendMagicLink(
  email: string,
  redirectUrl?: string
): Promise<{ sent: boolean }> {
  // Anti-enumeration: always return { sent: true }
  try {
    const user = await UserModel.findOne({ email });
    if (!user) {
      logger.debug("Magic link requested for unknown email (silently ignored)", { email });
      return { sent: true };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    // Store hashed token as OTP record
    await OTPModel.create({
      userId: user._id,
      code: tokenHash,
      type: "login",
      channel: "email",
      target: email,
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    });

    const settings = await getSettings();
    const appUrl = settings.appUrl || process.env.APP_URL || "http://localhost:3002";
    const verifyUrl =
      `${appUrl}/auth/magic-link/verify` +
      `?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}` +
      (redirectUrl ? `&redirect=${encodeURIComponent(redirectUrl)}` : "");

    const hasMailConfig = !!(process.env.SMTP_HOST || process.env.MAIL_HOST);
    if (hasMailConfig) {
      const t = getTransporter();
      await t.sendMail({
        from:
          process.env.SMTP_FROM ||
          `no-reply@${process.env.AUTH_DOMAIN || "zeroauth.local"}`,
        to: email,
        subject: `Sign in to ${settings.appName}`,
        text: `Click this link to sign in (expires in 15 minutes):\n\n${verifyUrl}\n\nIf you didn't request this, you can ignore this email.`,
        html: `<p>Click the link below to sign in (expires in 15 minutes):</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
      });
      logger.info("Magic link email sent", { email });
    } else {
      logger.info("Magic link (no mail transport — logging to console)", {
        email,
        verifyUrl,
      });
      console.log(`[MAGIC LINK] ${email} → ${verifyUrl}`);
    }
  } catch (err) {
    logger.error("sendMagicLink error", err as Error);
  }

  return { sent: true };
}

export async function verifyMagicLink(
  email: string,
  token: string
): Promise<{ userId: string; userEmail: string } | null> {
  try {
    const tokenHash = hashToken(token);

    const otpRecord = await OTPModel.findOne({
      target: email,
      channel: "email",
      type: "login",
      code: tokenHash,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      logger.warn("Magic link verification failed — record not found or expired", { email });
      return null;
    }

    // Single-use: delete the record
    await OTPModel.deleteOne({ _id: otpRecord._id });

    const user = await UserModel.findById(otpRecord.userId);
    if (!user) {
      logger.warn("Magic link user not found after record lookup", { userId: otpRecord.userId });
      return null;
    }

    return {
      userId: user._id.toString(),
      userEmail: user.email,
    };
  } catch (err) {
    logger.error("verifyMagicLink error", err as Error);
    return null;
  }
}
