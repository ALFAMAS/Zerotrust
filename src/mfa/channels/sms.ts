import { getLogger } from "../../logger";
const logger = getLogger("mfa-sms");

export async function sendSmsOTP(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM ?? process.env.TWILIO_SMS_FROM;

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

  // Not configured. Never log the OTP code, and never report success for a
  // message that was not delivered — that would let an MFA challenge "pass"
  // while the user receives nothing. Opt into a no-send dev stub explicitly.
  if (process.env.MFA_DEV_STUB === "true") {
    logger.warn("SMS OTP NOT delivered — MFA_DEV_STUB enabled, Twilio not configured", { to });
    return true;
  }
  logger.error(
    "SMS OTP not sent: Twilio not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)",
    { to }
  );
  return false;
}
