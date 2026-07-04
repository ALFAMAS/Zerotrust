"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assessSessionRisk = assessSessionRisk;
exports.computeRiskFactors = computeRiskFactors;
function assessSessionRisk(factors) {
    if (factors.anomalyScore > 0.8 || (factors.locationChanged && factors.deviceChanged)) {
        return {
            requiresReverification: true,
            level: "hard",
            reason: factors.anomalyScore > 0.8
                ? "High anomaly score detected"
                : "Location and device both changed",
            maxAgeSeconds: 300,
        };
    }
    if (factors.timeSinceLastActivity > 3600 || factors.sensitiveOperation) {
        return {
            requiresReverification: true,
            level: "soft",
            reason: factors.sensitiveOperation
                ? "Sensitive operation requires re-verification"
                : "Session inactive for over 1 hour",
            maxAgeSeconds: 1800,
        };
    }
    if (factors.locationChanged) {
        return {
            requiresReverification: true,
            level: "soft",
            reason: "Access from new location",
            maxAgeSeconds: 900,
        };
    }
    return { requiresReverification: false, level: "none", maxAgeSeconds: 3600 };
}
function computeRiskFactors(session, request, options = {}) {
    const now = Date.now();
    const lastActivity = session.lastActivityAt ? session.lastActivityAt.getTime() : now;
    const timeSinceLastActivity = Math.floor((now - lastActivity) / 1000);
    const locationChanged = !!(request.country &&
        session.country &&
        request.country !== session.country);
    const fp = session.deviceFingerprint;
    const reqAgent = request.userAgent ?? "";
    const sessionAgent = fp && typeof fp === "object" ? String(fp.userAgent ?? "") : "";
    const deviceChanged = !!(reqAgent && sessionAgent && reqAgent !== sessionAgent);
    const flags = session.anomalyFlags;
    const anomalyScore = flags && typeof flags === "object" && typeof flags.score === "number" ? flags.score : 0;
    return {
        timeSinceLastActivity,
        locationChanged,
        deviceChanged,
        anomalyScore,
        sensitiveOperation: options.sensitiveOperation ?? false,
    };
}
//# sourceMappingURL=sessionRisk.service.js.map