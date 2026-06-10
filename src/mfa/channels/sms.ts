import { getLogger } from "../../logger";
const logger = getLogger("mfa-sms");

export async function sendSmsOTP(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  if (accountSid && authToken && from) {
    try {
      // Lazy import to avoid hard dependency when not configured
      const { default: twilio } = await import("twilio");
      const client = twilio(accountSid, authToken);
      await client.messages.create({ to, from, body });
      logger.info("SMS OTP sent via Twilio", { to });
      return true;
    } catch (err) {
      logger.error("Failed to send SMS via Twilio", err as Error);
      return false;
    }
  }

  logger.info("SMS OTP (stub) sent", { to, body });
  return true;
}
