import nodemailer from "nodemailer";
import { getLogger } from "../../logger";

const logger = getLogger("mfa-email");

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (host) {
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    } as any);
    logger.info("SMTP transporter configured");
    return transporter;
  }

  // Fallback to jsonTransport for development
  transporter = nodemailer.createTransport({ jsonTransport: true } as any);
  logger.info("Using jsonTransport for email (development fallback)");
  return transporter;
}

export async function sendEmailOTP(to: string, subject: string, body: string) {
  const t = getTransporter();
  try {
    const info = await t.sendMail({
      from:
        process.env.SMTP_FROM ||
        `no-reply@${process.env.AUTH_DOMAIN || "zerotrust.local"}`,
      to,
      subject,
      text: body,
    });
    logger.info("Email OTP sent", {
      to,
      id: (info as any).messageId || "json",
    });
    return true;
  } catch (err) {
    logger.error("Failed to send email OTP", err as Error);
    return false;
  }
}
