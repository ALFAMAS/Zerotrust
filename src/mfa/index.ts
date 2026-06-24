import { getLogger } from "../logger";
import { sendEmailOTP } from "./channels/email";
import { sendSmsOTP } from "./channels/sms";
import { sendTelegramOTP } from "./channels/telegram";
import { sendWhatsAppOTP } from "./channels/whatsapp";

const logger = getLogger("mfa");

export async function sendOTP(
  channel: "email" | "sms" | "whatsapp" | "telegram",
  target: string,
  code: string
) {
  if (channel === "email") {
    return sendEmailOTP(target, "Your zerotrust OTP", `Your verification code is: ${code}`);
  }
  if (channel === "sms") {
    return sendSmsOTP(target, `Your verification code is: ${code}`);
  }
  if (channel === "whatsapp") {
    return sendWhatsAppOTP(target, `Your verification code is: ${code}`);
  }
  if (channel === "telegram") {
    return sendTelegramOTP(
      process.env.TELEGRAM_BOT_TOKEN || "",
      target,
      `Your verification code is: ${code}`
    );
  }
  logger.warn("Requested unsupported MFA channel", { channel });
  return false;
}
