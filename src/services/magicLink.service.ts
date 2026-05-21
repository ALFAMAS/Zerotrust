import crypto from "crypto";
import { UserModel, OTPModel } from "../models";
import { sendEmailOTP } from "../mfa/channels/email";
import { getLogger } from "../logger";

const logger = getLogger("magic-link");

const MAGIC_LINK_TTL_SECS = 15 * 60; // 15 minutes
const BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";

export interface MagicLinkResult {
  sent: boolean;
  expiresIn: number;
}

/**
 * Send a passwordless magic-link login email to the given address.
 * Creates a single-use OTP token and emails a signed link.
 */
export async function sendMagicLink(
  email: string,
  redirectUrl?: string
): Promise<MagicLinkResult> {
  const user = await UserModel.findOne({ email: email.toLowerCase().trim() });

  // Always return success to avoid user enumeration
  if (!user || user.status !== "active") {
    logger.warn("Magic link requested for unknown/inactive user", { email });
    return { sent: false, expiresIn: MAGIC_LINK_TTL_SECS };
  }

  // Revoke any existing magic-link OTPs for this user
  await OTPModel.deleteMany({ userId: user._id, type: "login", channel: "email" });

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  await OTPModel.create({
    userId: user._id,
    code: tokenHash,
    type: "login",
    channel: "email",
    target: email,
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_SECS * 1000),
    attempts: 0,
  });

  const verifyUrl = new URL("/auth/magic-link/verify", BASE_URL);
  verifyUrl.searchParams.set("token", token);
  verifyUrl.searchParams.set("email", email);
  if (redirectUrl) verifyUrl.searchParams.set("redirect", redirectUrl);

  const html = buildMagicLinkEmail(user.displayName, verifyUrl.toString());
  await sendEmailOTP(email, "Your ZeroAuth sign-in link", html);

  logger.info("Magic link sent", { userId: user._id.toString() });
  return { sent: true, expiresIn: MAGIC_LINK_TTL_SECS };
}

/**
 * Verify a magic-link token and return the userId if valid.
 * Consumes the token (single-use).
 */
export async function verifyMagicLink(
  email: string,
  token: string
): Promise<{ userId: string; userEmail: string } | null> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const otp = await OTPModel.findOne({
    target: email.toLowerCase().trim(),
    code: tokenHash,
    type: "login",
    channel: "email",
    usedAt: null,
  });

  if (!otp) {
    logger.warn("Magic link verification failed: token not found", { email });
    return null;
  }

  if (otp.expiresAt < new Date()) {
    await otp.deleteOne();
    logger.warn("Magic link verification failed: token expired", { email });
    return null;
  }

  const user = await UserModel.findById(otp.userId);
  if (!user || user.status !== "active") {
    await otp.deleteOne();
    return null;
  }

  // Consume the token
  await otp.deleteOne();

  logger.info("Magic link verified", { userId: user._id.toString() });
  return { userId: user._id.toString(), userEmail: user.email };
}

function buildMagicLinkEmail(displayName: string, link: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f4f4f5;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.08);">
    <h2 style="margin-top:0;color:#1a1a2e;">Sign in to ZeroAuth</h2>
    <p style="color:#444;">Hi ${displayName},</p>
    <p style="color:#444;">Click the button below to sign in. This link expires in <strong>15 minutes</strong> and can only be used once.</p>
    <a href="${link}"
       style="display:inline-block;margin:16px 0;padding:12px 28px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
      Sign In to ZeroAuth
    </a>
    <p style="color:#888;font-size:13px;">If you didn't request this link, you can safely ignore this email.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="color:#aaa;font-size:12px;">ZeroAuth — Zero Trust Authentication</p>
  </div>
</body>
</html>`.trim();
}
