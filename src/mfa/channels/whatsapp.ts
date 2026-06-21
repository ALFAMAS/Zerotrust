import { getLogger } from "../../logger";

const logger = getLogger("mfa-whatsapp");

export async function sendWhatsAppOTP(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (accountSid && authToken && from) {
    try {
      // Lazy import to avoid hard dependency when not configured
      const { default: twilio } = await import("twilio");
      const client = twilio(accountSid, authToken);
      await client.messages.create({ to: `whatsapp:${to}`, from: `whatsapp:${from}`, body });
      logger.info("WhatsApp OTP sent via Twilio", { to });
      return true;
    } catch (err) {
      logger.error("Failed to send WhatsApp via Twilio", err as Error);
      return false;
    }
  }

  // Not configured: do not fake delivery and do not log the code.
  if (process.env.MFA_DEV_STUB === "true") {
    logger.warn("WhatsApp OTP NOT delivered — MFA_DEV_STUB enabled, Twilio not configured", { to });
    return true;
  }
  logger.error(
    "WhatsApp OTP not sent: Twilio not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)",
    { to }
  );
  return false;
}
