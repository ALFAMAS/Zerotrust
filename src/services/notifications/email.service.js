"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWelcomeEmail = sendWelcomeEmail;
exports.sendMagicLinkEmail = sendMagicLinkEmail;
exports.sendOtpEmail = sendOtpEmail;
exports.sendVerificationEmail = sendVerificationEmail;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
exports.sendSecurityAlertEmail = sendSecurityAlertEmail;
exports.sendBillingEventEmail = sendBillingEventEmail;
exports.sendOrgInviteEmail = sendOrgInviteEmail;
exports.sendNotificationEmail = sendNotificationEmail;
exports.queueBillingEventEmail = queueBillingEventEmail;
exports.queueNotificationEmail = queueNotificationEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const index_1 = require("../../logger/index");
const billing_event_1 = require("../../templates/emails/billing-event");
const magic_link_1 = require("../../templates/emails/magic-link");
const notification_1 = require("../../templates/emails/notification");
const org_invite_1 = require("../../templates/emails/org-invite");
const otp_1 = require("../../templates/emails/otp");
const password_reset_1 = require("../../templates/emails/password-reset");
const security_alert_1 = require("../../templates/emails/security-alert");
const verify_email_1 = require("../../templates/emails/verify-email");
const welcome_1 = require("../../templates/emails/welcome");
const emailSuppression_service_1 = require("./emailSuppression.service");
const logger = (0, index_1.getLogger)("email-service");
const APP_NAME = process.env.APP_NAME ?? "zerotrust";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
// ── Singleton transport ────────────────────────────────────────────────────
let _transport = null;
function getTransport() {
    if (_transport)
        return _transport;
    const host = process.env.MAIL_HOST;
    const isProduction = process.env.NODE_ENV === "production";
    if (host || isProduction) {
        _transport = nodemailer_1.default.createTransport({
            host,
            port: parseInt(process.env.MAIL_PORT ?? "587", 10),
            secure: process.env.MAIL_PORT === "465",
            auth: process.env.MAIL_USER
                ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD }
                : undefined,
        });
    }
    else {
        // Dev / test — no-op transport that never actually sends
        _transport = nodemailer_1.default.createTransport({ jsonTransport: true });
    }
    return _transport;
}
// ── Generic send — never throws ───────────────────────────────────────────
async function sendEmail(opts) {
    try {
        // Honor the suppression list (hard bounces / complaints / manual blocks).
        if (await (0, emailSuppression_service_1.isEmailSuppressed)(opts.to)) {
            logger.info("Email skipped (suppressed recipient)", {
                to: opts.to,
                subject: opts.subject,
            });
            return;
        }
        const transport = getTransport();
        const from = process.env.MAIL_FROM ?? `noreply@${APP_NAME.toLowerCase().replace(/\s+/g, "")}.com`;
        await transport.sendMail({ from, ...opts });
        logger.info("Email sent", { to: opts.to, subject: opts.subject });
    }
    catch (err) {
        logger.error(`Failed to send email to ${opts.to} (subject: ${opts.subject})`, err);
    }
}
// ── Named send functions ──────────────────────────────────────────────────
async function sendWelcomeEmail(to, data) {
    const { subject, html, text } = (0, welcome_1.welcomeEmailTemplate)({
        ...data,
        appName: APP_NAME,
        appUrl: APP_URL,
    });
    await sendEmail({ to, subject, html, text });
}
// `data.locale` (optional) flows through to welcomeEmailTemplate for localization.
async function sendMagicLinkEmail(to, data) {
    const { subject, html, text } = (0, magic_link_1.magicLinkEmailTemplate)({
        name: data.name,
        magicLinkUrl: data.magicLinkUrl,
        expiresInMinutes: data.expiresInMinutes ?? 15,
        appName: APP_NAME,
        appUrl: APP_URL,
        locale: data.locale,
    });
    await sendEmail({ to, subject, html, text });
}
async function sendOtpEmail(to, data) {
    const { subject, html, text } = (0, otp_1.otpEmailTemplate)({
        name: data.name,
        code: data.code,
        expiresInMinutes: data.expiresInMinutes ?? 10,
        appName: APP_NAME,
    });
    await sendEmail({ to, subject, html, text });
}
async function sendVerificationEmail(to, data) {
    const { subject, html, text } = (0, verify_email_1.verifyEmailTemplate)({
        name: data.name,
        code: data.code,
        verifyUrl: data.verifyUrl,
        expiresInMinutes: data.expiresInMinutes ?? 30,
        appName: APP_NAME,
        locale: data.locale,
    });
    await sendEmail({ to, subject, html, text });
}
async function sendPasswordResetEmail(to, data) {
    const { subject, html, text } = (0, password_reset_1.passwordResetEmailTemplate)({
        name: data.name,
        resetUrl: data.resetUrl,
        expiresInMinutes: data.expiresInMinutes ?? 30,
        appName: APP_NAME,
        appUrl: APP_URL,
        locale: data.locale,
    });
    await sendEmail({ to, subject, html, text });
}
async function sendSecurityAlertEmail(to, data) {
    const { subject, html, text } = (0, security_alert_1.securityAlertEmailTemplate)({
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
async function sendBillingEventEmail(to, data) {
    const { subject, html, text } = (0, billing_event_1.billingEventEmailTemplate)({
        ...data,
        appName: APP_NAME,
        appUrl: APP_URL,
    });
    await sendEmail({ to, subject, html, text });
}
async function sendOrgInviteEmail(to, data) {
    const { subject, html, text } = (0, org_invite_1.orgInviteEmailTemplate)({
        email: to,
        inviterName: data.inviterName,
        orgName: data.orgName,
        role: data.role,
        acceptUrl: data.acceptUrl,
        expiresInDays: data.expiresInDays ?? 7,
        appName: APP_NAME,
        appUrl: APP_URL,
    });
    await sendEmail({ to, subject, html, text });
}
async function sendNotificationEmail(to, data) {
    const { subject, html, text } = (0, notification_1.notificationEmailTemplate)({
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
async function queueBillingEventEmail(to, data) {
    const { enqueueEmail } = await import("./emailQueue.js");
    await enqueueEmail("notification", to, {
        ...data,
        appName: APP_NAME,
        appUrl: APP_URL,
        isBilling: true,
    });
}
async function queueNotificationEmail(to, data) {
    const { enqueueEmail } = await import("./emailQueue.js");
    await enqueueEmail("notification", to, {
        ...data,
        appName: APP_NAME,
        appUrl: APP_URL,
    });
}
//# sourceMappingURL=email.service.js.map