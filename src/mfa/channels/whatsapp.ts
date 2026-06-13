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

  logger.info("WhatsApp OTP (stub) sent", { to, body });
  return true;
}
