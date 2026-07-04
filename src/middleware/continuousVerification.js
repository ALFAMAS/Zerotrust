"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sensitiveReverification = exports.verificationStore = void 0;
exports.recordVerification = recordVerification;
exports.getVerification = getVerification;
exports.requireReverification = requireReverification;
const factory_1 = require("hono/factory");
const index_js_1 = require("../logger/index.js");
const sessionRisk_service_js_1 = require("../services/auth/sessionRisk.service.js");
const logger = (0, index_js_1.getLogger)("continuous-verification");
exports.verificationStore = new Map();
const STORE_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [key, rec] of exports.verificationStore) {
        if (now - rec.verifiedAt > STORE_TTL_MS)
            exports.verificationStore.delete(key);
    }
}, STORE_TTL_MS).unref?.();
function recordVerification(sessionId, level) {
    exports.verificationStore.set(sessionId, { verifiedAt: Date.now(), level });
}
function getVerification(sessionId) {
    const rec = exports.verificationStore.get(sessionId);
    if (!rec)
        return null;
    if (Date.now() - rec.verifiedAt > STORE_TTL_MS) {
        exports.verificationStore.delete(sessionId);
        return null;
    }
    return rec;
}
function verificationLevelSatisfies(record, requiredLevel) {
    if (requiredLevel === "soft")
        return record.level === "soft" || record.level === "hard";
    return record.level === "hard";
}
function recentVerificationCovers(sessionId, requiredLevel, maxAgeSeconds) {
    const rec = getVerification(sessionId);
    if (!rec)
        return false;
    if ((Date.now() - rec.verifiedAt) / 1000 >= maxAgeSeconds)
        return false;
    return verificationLevelSatisfies(rec, requiredLevel);
}
/** Pre-configured guard for password change, MFA disable, billing cancel, org transfer, etc. */
exports.sensitiveReverification = requireReverification({ sensitiveOperation: true });
function requireReverification(opts = {}) {
    return (0, factory_1.createMiddleware)(async (c, next) => {
        const session = c.get("session");
        if (!session)
            return next();
        const request = {
            country: c.get("inferredCountry") ?? undefined,
            userAgent: c.req.header("user-agent") ?? undefined,
        };
        const factors = (0, sessionRisk_service_js_1.computeRiskFactors)({
            lastActivityAt: session.lastActivityAt ? new Date(session.lastActivityAt) : null,
            country: session.country ?? null,
            deviceFingerprint: session.deviceFingerprint ?? null,
            anomalyFlags: session.anomalyFlags ?? null,
        }, request, { sensitiveOperation: opts.sensitiveOperation });
        const assessment = (0, sessionRisk_service_js_1.assessSessionRisk)(factors);
        if (assessment.requiresReverification) {
            const maxAge = opts.maxAgeSeconds ?? assessment.maxAgeSeconds;
            const requiredLevel = assessment.level === "hard" ? "hard" : "soft";
            if (recentVerificationCovers(session.id, requiredLevel, maxAge)) {
                return next();
            }
            logger.warn("Re-verification required", {
                sessionId: session.id,
                level: assessment.level,
                reason: assessment.reason,
            });
            c.header("Www-Authenticate", `zerotrust-Reverify level=${assessment.level}`);
            return c.json({
                error: "REVERIFICATION_REQUIRED",
                level: assessment.level,
                reason: assessment.reason,
                challengeUrl: "/auth/verify/challenge",
            }, 401);
        }
        return next();
    });
}
//# sourceMappingURL=continuousVerification.js.map