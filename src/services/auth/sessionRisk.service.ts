export interface RiskFactors {
  timeSinceLastActivity: number;
  locationChanged: boolean;
  deviceChanged: boolean;
  anomalyScore: number;
  sensitiveOperation: boolean;
}

export interface RiskAssessment {
  requiresReverification: boolean;
  level: "none" | "soft" | "hard";
  reason?: string;
  maxAgeSeconds: number;
}

export function assessSessionRisk(factors: RiskFactors): RiskAssessment {
  if (factors.anomalyScore > 0.8 || (factors.locationChanged && factors.deviceChanged)) {
    return {
      requiresReverification: true,
      level: "hard",
      reason:
        factors.anomalyScore > 0.8
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

export function computeRiskFactors(
  session: {
    lastActivityAt: Date | null;
    country: string | null;
    deviceFingerprint: unknown;
    anomalyFlags: unknown;
  },
  request: { country?: string; userAgent?: string },
  options: { sensitiveOperation?: boolean } = {}
): RiskFactors {
  const now = Date.now();
  const lastActivity = session.lastActivityAt ? session.lastActivityAt.getTime() : now;
  const timeSinceLastActivity = Math.floor((now - lastActivity) / 1000);

  const locationChanged = !!(
    request.country &&
    session.country &&
    request.country !== session.country
  );

  const fp = session.deviceFingerprint as Record<string, unknown> | null;
  const reqAgent = request.userAgent ?? "";
  const sessionAgent = fp && typeof fp === "object" ? String(fp.userAgent ?? "") : "";
  const deviceChanged = !!(reqAgent && sessionAgent && reqAgent !== sessionAgent);

  const flags = session.anomalyFlags as Record<string, unknown> | null;
  const anomalyScore =
    flags && typeof flags === "object" && typeof flags.score === "number" ? flags.score : 0;

  return {
    timeSinceLastActivity,
    locationChanged,
    deviceChanged,
    anomalyScore,
    sensitiveOperation: options.sensitiveOperation ?? false,
  };
}
