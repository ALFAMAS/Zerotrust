import { insertAuditLog } from "../audit/chain";
import { claimProcessedWebhookEvent } from "../db/repositories/processedWebhookEvents.repository";
import { getLogger } from "../logger";
import { revokeSession } from "../middleware/sessionControl";
import { sha256Hex } from "../shared/cryptoHash";

const logger = getLogger("ssf-receiver");

type SSFEventPayload = Record<string, unknown>;

function asPayload(event: unknown): SSFEventPayload {
  return event && typeof event === "object" && !Array.isArray(event)
    ? (event as SSFEventPayload)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function ssfEventKey(event: unknown, payload: SSFEventPayload): string {
  const providerId =
    stringValue(payload.jti) ?? stringValue(payload.id) ?? stringValue(payload.eventId);
  if (providerId) return providerId;

  return `sha256:${sha256Hex(JSON.stringify(event) ?? String(event))}`;
}

function ssfEventType(payload: SSFEventPayload): string {
  return stringValue(payload.type) ?? "unknown";
}

function ssfMetadata(payload: SSFEventPayload): Record<string, unknown> {
  const details = payload.details;
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : {};
}

export async function handleSSFEvent(event: unknown) {
  const payload = asPayload(event);
  const eventType = ssfEventType(payload);
  const eventKey = ssfEventKey(event, payload);

  logger.info("Received SSF event", {
    eventType,
    severity: stringValue(payload.severity),
  });

  const claimed = await claimProcessedWebhookEvent({
    consumer: "ssf",
    eventKey,
    eventType,
  });

  if (!claimed) {
    logger.info("Skipping duplicate SSF event", { eventType });
    return { handled: true, duplicate: true };
  }

  try {
    await insertAuditLog({
      action: `SSF:${eventType}`,
      actorId: stringValue(payload.actorId),
      targetId: stringValue(payload.targetSessionId) ?? stringValue(payload.targetId),
      targetType: stringValue(payload.targetType) ?? "session",
      ipAddress: stringValue(payload.ip),
      success: true,
      metadata: ssfMetadata(payload),
    });
  } catch (e) {
    logger.error("Failed to write SSF audit", e as Error);
  }

  if (eventType === "compromise" || payload.severity === "critical") {
    const targetSessionId = stringValue(payload.targetSessionId);
    if (targetSessionId) {
      try {
        await revokeSession(targetSessionId, "SSF_COMPROMISE");
        logger.warn("Session revoked due to SSF compromise", { sessionId: targetSessionId });
      } catch (e) {
        logger.error("Failed to revoke session from SSF event", e as Error);
      }
    }
  }

  return { handled: true };
}
