import { and, desc, eq, ne } from "drizzle-orm";
import { getConfig } from "../config";
import { getDb } from "../db";
import { sessionsTable } from "../db/schema";
import { getLogger } from "../logger";

const logger = getLogger("session-control");

export async function enforceMaxConcurrentDevices(userId: string, maxDevices?: number) {
  const cfg = getConfig();
  const allowed = maxDevices ?? cfg.session.maxConcurrentDevices;
  const db = getDb();

  const activeSessions = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), eq(sessionsTable.isActive, true)))
    .orderBy(desc(sessionsTable.lastActivityAt));

  if (activeSessions.length <= allowed) return [];

  const toRevoke = activeSessions.slice(allowed).reverse();
  const revokedIds: string[] = [];

  for (const s of toRevoke) {
    await db
      .update(sessionsTable)
      .set({ isActive: false, revokedAt: new Date(), revokedReason: "MAX_DEVICES_EXCEEDED" })
      .where(eq(sessionsTable.id, s.id));
    revokedIds.push(s.id);
    logger.info("Revoked session due to max devices", { userId, sessionId: s.id });
  }

  return revokedIds;
}

export async function revokeSession(sessionId: string, reason = "manual_revocation") {
  const db = getDb();
  const rows = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);

  if (rows.length === 0) return false;

  await db
    .update(sessionsTable)
    .set({ isActive: false, revokedAt: new Date(), revokedReason: reason })
    .where(eq(sessionsTable.id, sessionId));

  logger.info("Session revoked", { sessionId, reason });
  return true;
}

export async function revokeAllSessionsForUser(userId: string, excludeSessionId?: string) {
  const db = getDb();

  const conditions = [eq(sessionsTable.userId, userId), eq(sessionsTable.isActive, true)];
  if (excludeSessionId) {
    conditions.push(ne(sessionsTable.id, excludeSessionId));
  }

  const result = await db
    .update(sessionsTable)
    .set({ isActive: false, revokedAt: new Date(), revokedReason: "ADMIN_REVOKE_ALL" })
    .where(and(...(conditions as [any, ...any[]])));

  const count = (result as any)?.rowCount ?? 0;
  logger.info("Revoked all sessions for user", { userId, excluded: excludeSessionId, count });
  return count;
}
