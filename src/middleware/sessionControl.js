"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceMaxConcurrentDevices = enforceMaxConcurrentDevices;
exports.revokeSession = revokeSession;
exports.revokeAllSessionsForUser = revokeAllSessionsForUser;
const drizzle_orm_1 = require("drizzle-orm");
const config_1 = require("../config");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const logger_1 = require("../logger");
const logger = (0, logger_1.getLogger)("session-control");
async function enforceMaxConcurrentDevices(userId, maxDevices) {
    const cfg = (0, config_1.getConfig)();
    const allowed = maxDevices ?? cfg.session.maxConcurrentDevices;
    const db = (0, db_1.getDb)();
    const activeSessions = await db
        .select()
        .from(schema_1.sessionsTable)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sessionsTable.userId, userId), (0, drizzle_orm_1.eq)(schema_1.sessionsTable.isActive, true)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.sessionsTable.lastActivityAt));
    if (activeSessions.length <= allowed)
        return [];
    const toRevoke = activeSessions.slice(allowed).reverse();
    const revokedIds = toRevoke.map((s) => s.id);
    await db
        .update(schema_1.sessionsTable)
        .set({ isActive: false, revokedAt: new Date(), revokedReason: "MAX_DEVICES_EXCEEDED" })
        .where((0, drizzle_orm_1.inArray)(schema_1.sessionsTable.id, revokedIds));
    for (const id of revokedIds) {
        logger.info("Revoked session due to max devices", { userId, sessionId: id });
    }
    return revokedIds;
}
async function revokeSession(sessionId, reason = "manual_revocation") {
    const db = (0, db_1.getDb)();
    const rows = await db
        .select()
        .from(schema_1.sessionsTable)
        .where((0, drizzle_orm_1.eq)(schema_1.sessionsTable.id, sessionId))
        .limit(1);
    if (rows.length === 0)
        return false;
    await db
        .update(schema_1.sessionsTable)
        .set({ isActive: false, revokedAt: new Date(), revokedReason: reason })
        .where((0, drizzle_orm_1.eq)(schema_1.sessionsTable.id, sessionId));
    logger.info("Session revoked", { sessionId, reason });
    return true;
}
async function revokeAllSessionsForUser(userId, excludeSessionId) {
    const db = (0, db_1.getDb)();
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.sessionsTable.userId, userId), (0, drizzle_orm_1.eq)(schema_1.sessionsTable.isActive, true)];
    if (excludeSessionId) {
        conditions.push((0, drizzle_orm_1.ne)(schema_1.sessionsTable.id, excludeSessionId));
    }
    const result = await db
        .update(schema_1.sessionsTable)
        .set({ isActive: false, revokedAt: new Date(), revokedReason: "ADMIN_REVOKE_ALL" })
        .where((0, drizzle_orm_1.and)(...conditions));
    // The `postgres` driver's update-without-.returning() result exposes the
    // affected row count as `.count`, not `.rowCount` (see dataRetention.ts) —
    // this was always reporting 0 revoked sessions to callers even though the
    // revocation itself succeeded.
    const count = result.count ?? 0;
    logger.info("Revoked all sessions for user", { userId, excluded: excludeSessionId, count });
    return count;
}
//# sourceMappingURL=sessionControl.js.map