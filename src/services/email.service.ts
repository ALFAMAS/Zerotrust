import nodemailer from "nodemailer";
import { getLogger } from "../logger";
import type { Locale } from "../shared/locale";
import { billingEventEmailTemplate } from "../templates/emails/billing-event";
import { magicLinkEmailTemplate } from "../templates/emails/magic-link";
import { notificationEmailTemplate } from "../templates/emails/notification";
import { otpEmailTemplate } from "../templates/emails/otp";
import { passwordResetEmailTemplate } from "../templates/emails/password-reset";
import { securityAlertEmailTemplate } from "../templates/emails/security-alert";
import { verifyEmailTemplate } from "../templates/emails/verify-email";
import { type WelcomeEmailData, welcomeEmailTemplate } from "../templates/emails/welcome";
import { isEmailSuppressed } from "./emailSuppression.service";

const logger = getLogger("email-service");

const APP_NAME = process.env.APP_NAME ?? "zerotrust";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

// ── Singleton transport ────────────────────────────────────────────────────

let _transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter {
  if (_transport) return _transport;

  const host = process.env.MAIL_HOST;
  const isProduction = process.env.NODE_ENV === "production";

  if (host || isProduction) {
    _transport = nodemailer.createTransport({
      host,
      port: parseInt(process.env.MAIL_PORT ?? "587", 10),
      secure: process.env.MAIL_PORT === "465",
      auth: process.env.MAIL_USER
        ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD }
        : undefined,
    } as nodemailer.TransportOptions);
  } else {
    // Dev / test — no-op transport that never actually sends
    _transport = nodemailer.createTransport({ jsonTransport: true } as any);
  }

  return _transport;
}

// ── Generic send — never throws ───────────────────────────────────────────

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  try {
    // Honor the suppression list (hard bounces / complaints / manual blocks).
    if (await isEmailSuppressed(opts.to)) {
      logger.info("Email skipped (suppressed recipient)", {
        to: opts.to,
        subject: opts.subject,
      });
      return;
    }
    const transport = getTransport();
    const from =
      process.env.MAIL_FROM ?? `noreply@${APP_NAME.toLowerCase().replace(/\s+/g, "")}.com`;
    await transport.sendMail({ from, ...opts });
    logger.info("Email sent", { to: opts.to, subject: opts.subject });
  } catch (err) {
    logger.error(`Failed to send email to ${opts.to} (subject: ${opts.subject})`, err as Error);
  }
}

// ── Named send functions ──────────────────────────────────────────────────

export async function sendWelcomeEmail(
  to: string,
  data: Omit<WelcomeEmailData, "appName" | "appUrl">
): Promise<void> {
  const { subject, html, text } = welcomeEmailTemplate({
    ...data,
    appName: APP_NAME,
    appUrl: APP_URL,
  });
  await sendEmail({ to, subject, html, text });
}
// `data.locale` (optional) flows through to welcomeEmailTemplate for localization.

export async function sendMagicLinkEmail(
  to: string,
  data: {
    name: string;
    magicLinkUrl: string;
    expiresInMinutes?: number;
    locale?: Locale;
  }
): Promise<void> {
  const { subject, html, text } = magicLinkEmailTemplate({
    name: data.name,
    magicLinkUrl: data.magicLinkUrl,
    expiresInMinutes: data.expiresInMinutes ?? 15,
    appName: APP_NAME,
    appUrl: APP_URL,
    locale: data.locale,
  });
  await sendEmail({ to, subject, html, text });
}

export async function sendOtpEmail(
  to: string,
  data: { name: string; code: string; expiresInMinutes?: number }
): Promise<void> {
  const { subject, html, text } = otpEmailTemplate({
    name: data.name,
    code: data.code,
    expiresInMinutes: data.expiresInMinutes ?? 10,
    appName: APP_NAME,
  });
  await sendEmail({ to, subject, html, text });
}

export async function sendVerificationEmail(
  to: string,
  data: {
    name: string;
    code: string;
    verifyUrl: string;
    expiresInMinutes?: number;
    locale?: Locale;
  }
): Promise<void> {
  const { subject, html, text } = verifyEmailTemplate({
    name: data.name,
    code: data.code,
    verifyUrl: data.verifyUrl,
    expiresInMinutes: data.expiresInMinutes ?? 30,
    appName: APP_NAME,
    locale: data.locale,
  });
  await sendEmail({ to, subject, html, text });
}

export async function sendPasswordResetEmail(
  to: string,
  data: {
    name: string;
    resetUrl: string;
    expiresInMinutes?: number;
    locale?: Locale;
  }
): Promise<void> {
  const { subject, html, text } = passwordResetEmailTemplate({
    name: data.name,
    resetUrl: data.resetUrl,
    expiresInMinutes: data.expiresInMinutes ?? 30,
    appName: APP_NAME,
    appUrl: APP_URL,
    locale: data.locale,
  });
  await sendEmail({ to, subject, html, text });
}

export async function sendSecurityAlertEmail(
  to: string,
  data: {
    name: string;
    action: string;
    device: string;
    location: string;
    time: string;
    revokeSessionUrl?: string;
  }
): Promise<void> {
  const { subject, html, text } = securityAlertEmailTemplate({
    name: data.name,
    action: data.action,
    device: data.device,
    location: data.location,
    time: data.time,
    revokeSessionUrl: data.revokeSessionUrl,
    appName: APP_NAME,
    appUrl: APP_URL,
  });
  await sendEmail({ to, subject, html, text });
}

export async function sendBillingEventEmail(
  to: string,
  data: {
    name: string;
    title: string;
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
  }
): Promise<void> {
  const { subject, html, text } = billingEventEmailTemplate({
    ...data,
    appName: APP_NAME,
    appUrl: APP_URL,
  });
  await sendEmail({ to, subject, html, text });
}

export async function sendNotificationEmail(
  to: string,
  data: {
    name: string;
    title: string;
    body: string;
    link?: string;
    unsubscribeUrl?: string;
  }
): Promise<void> {
  const { subject, html, text } = notificationEmailTemplate({
    name: data.name,
    title: data.title,
    body: data.body,
    link: data.link,
    unsubscribeUrl: data.unsubscribeUrl,
    appName: APP_NAME,
    appUrl: APP_URL,
  });
  await sendEmail({ to, subject, html, text });
}

// ── BullMQ queued versions ─────────────────────────────────────────────────────

export async function queueBillingEventEmail(
  to: string,
  data: {
    name: string;
    title: string;
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
  }
): Promise<void> {
  const { enqueueEmail } = await import("./emailQueue.js");
  await enqueueEmail("notification", to, {
    ...data,
    appName: APP_NAME,
    appUrl: APP_URL,
    isBilling: true,
  });
}

export async function queueNotificationEmail(
  to: string,
  data: {
    name: string;
    title: string;
    body: string;
    link?: string;
    unsubscribeUrl?: string;
  }
): Promise<void> {
  const { enqueueEmail } = await import("./emailQueue.js");
  await enqueueEmail("notification", to, {
    ...data,
    appName: APP_NAME,
    appUrl: APP_URL,
  });
}
