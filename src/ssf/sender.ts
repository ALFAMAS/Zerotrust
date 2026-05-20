import { getLogger } from "../logger";

const logger = getLogger("ssf-sender");

export async function sendSSFEvent(targetUrl: string, event: any) {
  try {
    await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    logger.info("Sent SSF event", { targetUrl, eventType: event?.type });
    return true;
  } catch (err) {
    logger.error("Failed to send SSF event", err as Error);
    return false;
  }
}
