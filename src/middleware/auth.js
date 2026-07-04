"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuthMiddleware = exports.requireAdmin = exports.authMiddleware = void 0;
exports.activityRefreshSeconds = activityRefreshSeconds;
exports.shouldRefreshActivity = shouldRefreshActivity;
exports.initAuthMiddleware = initAuthMiddleware;
const drizzle_orm_1 = require("drizzle-orm");
const factory_1 = require("hono/factory");
const config_1 = require("../config");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const logger_1 = require("../logger");
const sessionPolicy_service_1 = require("../services/auth/sessionPolicy.service");
const token_service_1 = require("../services/auth/token.service");
const userStateCache_service_1 = require("../services/auth/userStateCache.service");
const principal_1 = require("../shared/principal");
const roles_1 = require("../shared/roles");
const types_1 = require("../shared/types");
const resolveOrgContext_1 = require("../db/resolveOrgContext");
const sessionControl_1 = require("./sessionControl");
const logger = (0, logger_1.getLogger)("auth-middleware");
let tokenService;
/**
 * Default minimum interval, in seconds, between `sessions.last_activity_at`
 * writes. Overridable with `SESSION_ACTIVITY_REFRESH_SECONDS`.
 */
const DEFAULT_ACTIVITY_REFRESH_SECONDS = 60;
/**
 * How long we may wait before persisting a fresh `last_activity_at`.
 *
 * Writing the activity timestamp on *every* authenticated request turns each
 * read into a write — doubling DB write volume on hot endpoints and adding the
 * round-trip straight to p95. Instead we refresh at most once per window.
 *
 * The window is also clamped to half of the org idle-timeout (when one is set)
 * so idle-session enforcement — which reads `last_activity_at` in
 * `evaluateSessionPolicy` — never drifts by more than half its budget.
 */
function activityRefreshSeconds(idleTimeoutSeconds) {
    const raw = Number(process.env.SESSION_ACTIVITY_REFRESH_SECONDS ?? DEFAULT_ACTIVITY_REFRESH_SECONDS);
    const base = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_ACTIVITY_REFRESH_SECONDS;
    if (idleTimeoutSeconds && idleTimeoutSeconds > 0) {
        return Math.max(1, Math.min(base, Math.floor(idleTimeoutSeconds / 2)));
    }
    return base;
}
/**
 * Decide whether a session's `last_activity_at` is stale enough to persist a
 * new value. Fails open (returns `true`) for a missing/invalid timestamp or a
 * non-positive interval so we never silently stop tracking activity.
 */
function shouldRefreshActivity(lastActivityAt, now, intervalSeconds) {
    if (!lastActivityAt)
        return true;
    if (intervalSeconds <= 0)
        return true;
    const last = lastActivityAt instanceof Date ? lastActivityAt : new Date(lastActivityAt);
    if (Number.isNaN(last.getTime()))
        return true;
    return now.getTime() - last.getTime() >= intervalSeconds * 1000;
}
async function initAuthMiddleware() {
    const config = (0, config_1.getConfig)();
    tokenService = new token_service_1.TokenService(config.security.tokenSecretHex, config.session);
    await tokenService.init();
    logger.info("✓ Auth middleware initialized");
}
exports.authMiddleware = (0, factory_1.createMiddleware)(async (c, next) => {
    try {
        const authHeader = c.req.header("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return c.json({
                error: types_1.ErrorCodes.TOKEN_INVALID,
                message: "Missing or malformed Authorization header",
            }, 401);
        }
        const token = authHeader.substring(7);
        let payload;
        try {
            payload = await tokenService.verifyAccessToken(token);
        }
        catch (error) {
            if (error instanceof Error && error.message === "TOKEN_EXPIRED") {
                return c.json({
                    error: types_1.ErrorCodes.TOKEN_EXPIRED,
                    message: "Access token has expired",
                }, 401);
            }
            return c.json({
                error: types_1.ErrorCodes.TOKEN_INVALID,
                message: "Invalid or tampered token",
            }, 401);
        }
        const db = (0, db_1.getDb)();
        const cachedUser = await (0, userStateCache_service_1.getUserCached)(payload.sub);
        let session;
        let userRow;
        try {
            if (cachedUser) {
                const sessionRows = await db
                    .select({ session: schema_1.sessionsTable })
                    .from(schema_1.sessionsTable)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sessionsTable.tokenId, payload.jti), (0, drizzle_orm_1.eq)(schema_1.sessionsTable.userId, payload.sub), (0, drizzle_orm_1.eq)(schema_1.sessionsTable.isActive, true)))
                    .limit(1);
                if (sessionRows.length === 0) {
                    return c.json({
                        error: types_1.ErrorCodes.SESSION_NOT_FOUND,
                        message: "Session not found or revoked",
                    }, 401);
                }
                session = sessionRows[0].session;
                userRow = cachedUser;
            }
            else {
                const authRows = await db
                    .select({ session: schema_1.sessionsTable, user: schema_1.usersTable })
                    .from(schema_1.sessionsTable)
                    .innerJoin(schema_1.usersTable, (0, drizzle_orm_1.eq)(schema_1.sessionsTable.userId, schema_1.usersTable.id))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sessionsTable.tokenId, payload.jti), (0, drizzle_orm_1.eq)(schema_1.sessionsTable.userId, payload.sub), (0, drizzle_orm_1.eq)(schema_1.sessionsTable.isActive, true)))
                    .limit(1);
                if (authRows.length === 0) {
                    return c.json({
                        error: types_1.ErrorCodes.SESSION_NOT_FOUND,
                        message: "Session not found or revoked",
                    }, 401);
                }
                ({ session, user: userRow } = authRows[0]);
                void (0, userStateCache_service_1.cacheUserState)(userRow);
            }
        }
        catch (dbErr) {
            logger.error("Auth middleware DB error", dbErr);
            return c.json({ error: "SERVICE_UNAVAILABLE", message: "Database temporarily unavailable" }, 503);
        }
        if (session.expiresAt < new Date()) {
            await db
                .update(schema_1.sessionsTable)
                .set({ isActive: false })
                .where((0, drizzle_orm_1.eq)(schema_1.sessionsTable.id, session.id));
            return c.json({ error: types_1.ErrorCodes.SESSION_EXPIRED, message: "Session has expired" }, 401);
        }
        if (session.revokedAt) {
            return c.json({
                error: types_1.ErrorCodes.TOKEN_REVOKED,
                message: "Session has been revoked",
            }, 401);
        }
        // Enforce org-level session & device policy (strictest across the user's
        // orgs). The effective policy is cached, and only orgs that configured a
        // limit do any work here.
        const sessionPolicy = await (0, sessionPolicy_service_1.getEffectiveSessionPolicy)(session.userId);
        const policyDecision = (0, sessionPolicy_service_1.evaluateSessionPolicy)(session, sessionPolicy);
        if (!policyDecision.allowed) {
            await (0, sessionControl_1.revokeSession)(session.id, policyDecision.reason).catch(() => { });
            return c.json({
                error: policyDecision.reason,
                message: "Session ended by your organization's security policy",
            }, 401);
        }
        if (sessionPolicy.maxConcurrentSessions > 0) {
            const currentRevoked = await (0, sessionPolicy_service_1.enforceConcurrentSessionCap)(session.userId, sessionPolicy.maxConcurrentSessions, session.id);
            if (currentRevoked) {
                return c.json({
                    error: "SESSION_CONCURRENT_LIMIT",
                    message: "Session ended: concurrent-session limit reached",
                }, 401);
            }
        }
        if (userRow.status === "deleted") {
            return c.json({
                error: types_1.ErrorCodes.USER_DELETED,
                message: "User account has been deleted",
            }, 401);
        }
        if (userRow.status === "suspended") {
            return c.json({
                error: types_1.ErrorCodes.USER_SUSPENDED,
                message: "User account is suspended",
            }, 403);
        }
        // Set typed context variables. `userRow`/`session` come from a raw
        // Drizzle select on untyped jsonb columns, so these casts translate the
        // DB's storage shape into the canonical `User`/`Session` types everything
        // downstream relies on (see shared/types.ts).
        c.set("user", {
            id: userRow.id,
            email: userRow.email,
            username: userRow.username,
            passwordHash: userRow.passwordHash,
            phone: userRow.phone,
            displayName: userRow.displayName,
            avatarUrl: userRow.avatarUrl,
            roles: userRow.roles ?? [],
            attributes: userRow.attributes ?? {},
            mfa: userRow.mfa ?? {
                totp: { enabled: false, backupCodes: [] },
                webauthn: { enabled: false },
            },
            passkeys: userRow.passkeys ?? [],
            oauthProviders: userRow.oauthProviders ?? [],
            status: userRow.status,
            parentUserId: userRow.parentUserId,
            subUserIds: userRow.subUserIds ?? [],
            sessionConfig: userRow.sessionConfig ?? {},
            lastLoginAt: userRow.lastLoginAt,
            metadata: userRow.metadata,
            createdAt: userRow.createdAt,
            updatedAt: userRow.updatedAt,
        });
        c.set("session", {
            id: session.id,
            userId: session.userId,
            tokenId: session.tokenId,
            deviceFingerprint: session.deviceFingerprint ?? {},
            ipAddress: session.ipAddress,
            country: session.country,
            userAgent: session.userAgent,
            expiresAt: session.expiresAt,
            lastActivityAt: session.lastActivityAt,
            isActive: session.isActive,
            revokedAt: session.revokedAt,
            revokedReason: session.revokedReason,
            proofOfPossessionKey: session.proofOfPossessionKey,
            continuousEvalResult: session.continuousEvalResult,
            anomalyFlags: session.anomalyFlags,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
        });
        c.set("token", payload);
        // Derive audit principal from token (agent/human + delegation chain).
        // Impersonation sessions also record the admin in session.deviceFingerprint;
        // merge that into act_as so forensics see the full chain even for tokens
        // minted before act_as was added to the impersonation payload.
        let auditPrincipal = (0, principal_1.principalFromToken)(payload);
        const impersonatorId = session.deviceFingerprint
            ?.impersonatedBy;
        if (impersonatorId) {
            const chain = auditPrincipal.actAs ?? [];
            if (!chain.includes(impersonatorId)) {
                auditPrincipal = { ...auditPrincipal, actAs: [...chain, impersonatorId] };
            }
        }
        c.set("auditPrincipal", auditPrincipal);
        // Refresh last activity — throttled. Skipping the write on hot sessions
        // keeps reads off the write path (see activityRefreshSeconds), while the
        // window stays below the org idle-timeout so policy enforcement is exact.
        const activityNow = new Date();
        if (shouldRefreshActivity(session.lastActivityAt, activityNow, activityRefreshSeconds(sessionPolicy.idleTimeoutSeconds))) {
            await db
                .update(schema_1.sessionsTable)
                .set({ lastActivityAt: activityNow })
                .where((0, drizzle_orm_1.eq)(schema_1.sessionsTable.id, session.id));
        }
        // Resolve `X-Org-Id` into Hono context; `orgRlsMiddleware` sets `app.org_id`
        // inside a transaction on org-scoped routers.
        await (0, resolveOrgContext_1.resolveAndSetActiveOrg)(c, c.get("user"));
        logger.debug("✓ Token verified", {
            userId: payload.sub,
            sessionId: payload.sid,
            principal: (0, principal_1.describePrincipal)(auditPrincipal),
            activeOrgId: c.get("activeOrgId"),
        });
        return next();
    }
    catch (error) {
        if (error instanceof types_1.zerotrustError) {
            return c.json({ error: error.code, message: error.message }, error.statusCode);
        }
        logger.error("Auth middleware error", error);
        return c.json({ error: "INTERNAL_ERROR", message: "Authentication failed" }, 500);
    }
});
/**
 * Require the authenticated principal to hold the `admin` role. Must run after
 * `authMiddleware` (it reads the user it sets). Use this to guard one-off admin
 * endpoints mounted directly on the app rather than through an admin router.
 */
exports.requireAdmin = (0, factory_1.createMiddleware)(async (c, next) => {
    const user = c.get("user");
    if (!user) {
        return c.json({ error: types_1.ErrorCodes.TOKEN_INVALID, message: "Authentication required" }, 401);
    }
    if (!(0, roles_1.isAdmin)(user)) {
        return c.json({ error: "FORBIDDEN", message: "Admin role required" }, 403);
    }
    return next();
});
exports.optionalAuthMiddleware = (0, factory_1.createMiddleware)(async (c, next) => {
    try {
        const authHeader = c.req.header("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            await next();
            return;
        }
        const token = authHeader.substring(7);
        try {
            const payload = await tokenService.verifyAccessToken(token);
            const db = (0, db_1.getDb)();
            let sessionRows;
            try {
                sessionRows = await db
                    .select()
                    .from(schema_1.sessionsTable)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sessionsTable.tokenId, payload.jti), (0, drizzle_orm_1.eq)(schema_1.sessionsTable.userId, payload.sub), (0, drizzle_orm_1.eq)(schema_1.sessionsTable.isActive, true)))
                    .limit(1);
            }
            catch (dbErr) {
                // Optional auth — DB failure should not block the request
                logger.warn("Optional auth DB error", { error: String(dbErr) });
                await next();
                return;
            }
            if (sessionRows.length > 0) {
                const session = sessionRows[0];
                if (session.expiresAt >= new Date() && !session.revokedAt) {
                    const userRows = await db
                        .select()
                        .from(schema_1.usersTable)
                        .where((0, drizzle_orm_1.eq)(schema_1.usersTable.id, payload.sub))
                        .limit(1);
                    if (userRows.length > 0 && userRows[0].status === "active") {
                        const userRow = userRows[0];
                        c.set("user", {
                            id: userRow.id,
                            email: userRow.email,
                            displayName: userRow.displayName,
                            roles: userRow.roles ?? [],
                            attributes: userRow.attributes ?? {},
                            mfa: userRow.mfa ?? {
                                totp: { enabled: false, backupCodes: [] },
                                webauthn: { enabled: false },
                            },
                            passkeys: userRow.passkeys ?? [],
                            oauthProviders: userRow.oauthProviders ?? [],
                            status: userRow.status,
                            subUserIds: userRow.subUserIds ?? [],
                            sessionConfig: userRow.sessionConfig ?? {},
                            lastLoginAt: userRow.lastLoginAt,
                            createdAt: userRow.createdAt,
                            updatedAt: userRow.updatedAt,
                        });
                        c.set("session", {
                            id: session.id,
                            userId: session.userId,
                            tokenId: session.tokenId,
                            deviceFingerprint: session.deviceFingerprint ?? {},
                            ipAddress: session.ipAddress,
                            expiresAt: session.expiresAt,
                            lastActivityAt: session.lastActivityAt,
                            isActive: session.isActive,
                        });
                        c.set("token", payload);
                    }
                }
            }
        }
        catch {
            // ignore — optional auth
        }
        await next();
    }
    catch (error) {
        logger.warn("Optional auth middleware error", { error: String(error) });
        await next();
    }
});
//# sourceMappingURL=auth.js.map