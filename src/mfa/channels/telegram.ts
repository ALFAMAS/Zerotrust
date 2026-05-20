import { getLogger } from "../../logger";
const logger = getLogger("mfa-telegram");

export async function sendTelegramOTP(botToken: string, chatId: string, body: string) {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.info("Telegram OTP (stub) sent (no bot token)", { chatId, body });
    return true;
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
