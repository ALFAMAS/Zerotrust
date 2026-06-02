import crypto from "crypto";
import nodemailer from "nodemailer";
import { eq, and, gt } from "drizzle-orm";
import { getDb } from "../db";
import { usersTable, otpsTable } from "../db/schema";
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
          ? { user: process.env.SMTP_USER || process.env.MAIL_USER, pass: process.env.SMTP_PASS || process.env.MAIL_PASS }
          : undefined,
    } as any);
  } else {
    _transporter = nodemailer.createTransport({ jsonTransport: true } as any);
  }
  return _transporter;
}

export async function sendMagicLink(email: string, redirectUrl?: string): Promise<{ sent: boolean }> {
  try {
    const db = getDb();
    const userRows = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);

    if (userRows.length === 0) {
      logger.debug("Magic link requested for unknown email (silently ignored)", { email });
      return { sent: true };
    }

    const user = userRows[0];
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    await db.insert(otpsTable).values({
      userId: user.id,
      code: tokenHash,
      type: "login",
      channel: "email",
      target: email,
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    });

    const settings = await getSettings();
    const appUrl = settings.appUrl || process.env.APP_URL || "http://localhost:3001";
    const verifyUrl =
      `${appUrl}/auth/magic-link/verify` +
      `?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}` +
      (redirectUrl ? `&redirect=${encodeURIComponent(redirectUrl)}` : "");

    const hasMailConfig = !!(process.env.SMTP_HOST || process.env.MAIL_HOST);
    if (hasMailConfig) {
      const t = getTransporter();
      await t.sendMail({
        from: process.env.SMTP_FROM || `no-reply@${process.env.AUTH_DOMAIN || "zeroauth.local"}`,
        to: email,
        subject: `Sign in to ${settings.appName}`,
        text: `Click this link to sign in (expires in 15 minutes):\n\n${verifyUrl}\n\nIf you didn't request this, you can ignore this email.`,
        html: `<p>Click the link below to sign in (expires in 15 minutes):</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
      });
      logger.info("Magic link email sent", { email });
    } else {
      logger.info("Magic link (no mail transport — logging to console)", { email, verifyUrl });
      console.log(`[MAGIC LINK] ${email} → ${verifyUrl}`);
    }
  } catch (err) {
    logger.error("sendMagicLink error", err as Error);
  }
  return { sent: true };
}

export async function verifyMagicLink(email: string, token: string): Promise<{ userId: string; userEmail: string } | null> {
  try {
    const tokenHash = hashToken(token);
    const db = getDb();
    const now = new Date();

    const records = await db.select().from(otpsTable).where(
      and(
        eq(otpsTable.target, email),
        eq(otpsTable.channel, "email"),
        eq(otpsTable.type, "login"),
        eq(otpsTable.code, tokenHash),
        gt(otpsTable.expiresAt, now)
      )
    ).limit(1);

    if (records.length === 0) {
      logger.warn("Magic link verification failed — record not found or expired", { email });
      return null;
    }

    const record = records[0];
    await db.delete(otpsTable).where(eq(otpsTable.id, record.id));

    const userRows = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, record.userId)).limit(1);
    if (userRows.length === 0) {
      logger.warn("Magic link user not found after record lookup", { userId: record.userId });
      return null;
    }

    return { userId: userRows[0].id, userEmail: userRows[0].email };
  } catch (err) {
    logger.error("verifyMagicLink error", err as Error);
    return null;
  }
}
