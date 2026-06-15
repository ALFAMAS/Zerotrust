import { getLogger } from "../../logger";
const logger = getLogger("mfa-telegram");

export async function sendTelegramOTP(botToken: string, chatId: string, body: string) {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // Not configured: do not fake delivery and do not log the code.
    if (process.env.MFA_DEV_STUB === "true") {
      logger.warn("Telegram OTP NOT delivered — MFA_DEV_STUB enabled, no bot token", { chatId });
      return true;
    }
    logger.error("Telegram OTP not sent: no bot token (set TELEGRAM_BOT_TOKEN)", { chatId });
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: body }),
    });
    logger.info("Telegram OTP sent", { chatId });
    return true;
  } catch (err) {
    logger.error("Failed to send Telegram OTP", err as Error);
    return false;
  }
}
