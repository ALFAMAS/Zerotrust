import { createMiddleware } from "hono/factory";
import { getLogger } from "../logger/index.js";
import { assessSessionRisk, computeRiskFactors } from "../services/auth/sessionRisk.service.js";
import type { HonoEnv } from "../shared/types.js";

const logger = getLogger("continuous-verification");

export interface ContinuousVerificationOptions {
  sensitiveOperation?: boolean;
  maxAgeSeconds?: number;
}

interface VerificationRecord {
  verifiedAt: number;
  level: string;
}

export const verificationStore = new Map<string, VerificationRecord>();

const STORE_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of verificationStore) {
    if (now - rec.verifiedAt > STORE_TTL_MS) verificationStore.delete(key);
  }
}, STORE_TTL_MS).unref?.();

export function recordVerification(sessionId: string, level: string): void {
  verificationStore.set(sessionId, { verifiedAt: Date.now(), level });
}

export function getVerification(sessionId: string): VerificationRecord | null {
  const rec = verificationStore.get(sessionId);
  if (!rec) return null;
  if (Date.now() - rec.verifiedAt > STORE_TTL_MS) {
    verificationStore.delete(sessionId);
    return null;
  }
  return rec;
}

function verificationLevelSatisfies(
  record: VerificationRecord,
  requiredLevel: "soft" | "hard"
): boolean {
  if (requiredLevel === "soft") return record.level === "soft" || record.level === "hard";
  return record.level === "hard";
}

function recentVerificationCovers(
  sessionId: string,
  requiredLevel: "soft" | "hard",
  maxAgeSeconds: number
): boolean {
  const rec = getVerification(sessionId);
  if (!rec) return false;
  if ((Date.now() - rec.verifiedAt) / 1000 >= maxAgeSeconds) return false;
  return verificationLevelSatisfies(rec, requiredLevel);
}

/** Pre-configured guard for password change, MFA disable, billing cancel, org transfer, etc. */
export const sensitiveReverification = requireReverification({ sensitiveOperation: true });

export function requireReverification(opts: ContinuousVerificationOptions = {}) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const session = c.get("session");
    if (!session) return next();

    const request = {
      country: c.get("inferredCountry") ?? undefined,
      userAgent: c.req.header("user-agent") ?? undefined,
    };

    const factors = computeRiskFactors(
      {
        lastActivityAt: session.lastActivityAt ? new Date(session.lastActivityAt) : null,
        country: ((session as unknown as Record<string, unknown>).country as string | null) ?? null,
        deviceFingerprint:
          (session as unknown as Record<string, unknown>).deviceFingerprint ?? null,
        anomalyFlags: (session as unknown as Record<string, unknown>).anomalyFlags ?? null,
      },
      request,
      { sensitiveOperation: opts.sensitiveOperation }
    );

    const assessment = assessSessionRisk(factors);

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
      return c.json(
        {
          error: "REVERIFICATION_REQUIRED",
          level: assessment.level,
          reason: assessment.reason,
          challengeUrl: "/auth/verify/challenge",
        },
        401
      );
    }

    return next();
  });
}
