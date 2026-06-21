import { insertAuditLog } from "../audit/chain";
import { getLogger } from "../logger";
import { revokeSession } from "../middleware/sessionControl";

const logger = getLogger("ssf-receiver");

export async function handleSSFEvent(event: any) {
  logger.info("Received SSF event", { eventType: event?.type, severity: event?.severity });

  try {
    await insertAuditLog({
      action: `SSF:${event.type}`,
      actorId: event.actorId || null,
      targetId: event.targetSessionId || event.targetId || null,
      targetType: event.targetType || "session",
      ipAddress: event.ip || null,
      success: true,
      metadata: event.details || {},
    });
  } catch (e) {
    logger.error("Failed to write SSF audit", e as Error);
  }

  if (event.type === "compromise" || event.severity === "critical") {
    if (event.targetSessionId) {
      try {
        await revokeSession(event.targetSessionId, "SSF_COMPROMISE");
        logger.warn("Session revoked due to SSF compromise", { sessionId: event.targetSessionId });
      } catch (e) {
        logger.error("Failed to revoke session from SSF event", e as Error);
      }
    }
  }

  return { handled: true };
}
