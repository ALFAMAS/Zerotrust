import { getLogger } from "../logger";
import { AuditModel, SessionModel } from "../models";
import { revokeSession } from "../middleware/sessionControl";

const logger = getLogger("ssf-receiver");

/**
 * Handle incoming SSF event (Security Event Token / SET)
 * Expected minimal shape: { type: string, severity?: string, targetSessionId?: string, actorId?: string, details?: object }
 */
export async function handleSSFEvent(event: any) {
  logger.info("Received SSF event", { eventType: event?.type, severity: event?.severity });

  // Persist as audit
  try {
    await AuditModel.create({
      action: `SSF:${event.type}`,
      actorId: event.actorId,
      targetId: event.targetSessionId || event.targetId || undefined,
      targetType: event.targetType || "session",
      ipAddress: event.ip || undefined,
      success: true,
      metadata: event.details || {},
      timestamp: new Date(),
    } as any);
  } catch (e) {
    logger.error("Failed to write SSF audit", e as Error);
  }

  // Automated action for high severity compromise events
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
