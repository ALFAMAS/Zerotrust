"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmailOTP = sendEmailOTP;
const nodemailer_1 = __importDefault(require("nodemailer"));
const logger_1 = require("../../logger");
const logger = (0, logger_1.getLogger)("mfa-email");
let transporter = null;
function getTransporter() {
    if (transporter)
        return transporter;
    const host = process.env.SMTP_HOST;
    if (host) {
        const port = parseInt(process.env.SMTP_PORT || "587", 10);
        transporter = nodemailer_1.default.createTransport({
            host,
            port,
            secure: process.env.SMTP_SECURE === "true",
            auth: process.env.SMTP_USER
                ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                : undefined,
        });
        logger.info("SMTP transporter configured");
        return transporter;
    }
    // Fallback to jsonTransport for development
    transporter = nodemailer_1.default.createTransport({ jsonTransport: true });
    logger.info("Using jsonTransport for email (development fallback)");
    return transporter;
}
async function sendEmailOTP(to, subject, body) {
    const t = getTransporter();
    try {
        const info = await t.sendMail({
            from: process.env.SMTP_FROM || `no-reply@${process.env.AUTH_DOMAIN || "zerotrust.local"}`,
            to,
            subject,
            text: body,
        });
        logger.info("Email OTP sent", {
            to,
            id: info.messageId || "json",
        });
        return true;
    }
    catch (err) {
        logger.error("Failed to send email OTP", err);
        return false;
    }
}
//# sourceMappingURL=email.js.map