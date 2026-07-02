import { createMiddleware } from "hono/factory";
import { getLogger } from "../logger/index.js";
import {
  type BehaviorObservation,
  computeDeviceHash,
  scoreAnomaly,
  updateBaseline,
} from "../services/auth/anomalyDetection.service.js";
import type { HonoEnv } from "../shared/types.js";

const logger = getLogger("anomaly-middleware");

export interface AnomalyMiddlewareOptions {
  blockThreshold?: number;
  flagThreshold?: number;
  updateBaseline?: boolean;
}

export function anomalyDetectionMiddleware(opts: AnomalyMiddlewareOptions = {}) {
  const blockThreshold = opts.blockThreshold ?? 0.95;
  const flagThreshold = opts.flagThreshold ?? 0.7;
  const shouldUpdate = opts.updateBaseline !== false;

  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) return next();

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("x-real-ip") ||
      "unknown";
    const country = c.get("inferredCountry") ?? null;
    const userAgent = c.req.header("user-agent") ?? "";
    const deviceHash = computeDeviceHash(userAgent);
    const loginHour = new Date().getUTCHours();

    const obs: BehaviorObservation = { userId: user.id, ip, country, deviceHash, loginHour };

    try {
      const signals = await scoreAnomaly(obs);

      if (signals.overallScore >= blockThreshold) {
        logger.warn("Access blocked: anomalous behavior", {
          userId: user.id,
          score: signals.overallScore,
          flags: signals.flags,
        });
        return c.json(
          { error: "ACCESS_BLOCKED", reason: "Anomalous behavior detected", flags: signals.flags },
          403
        );
      }

      if (signals.overallScore >= flagThreshold) {
        logger.warn("Anomaly flagged", {
          userId: user.id,
          score: signals.overallScore,
          flags: signals.flags,
        });
      }
    } catch (err) {
      logger.warn("Anomaly scoring failed, continuing", { error: String(err) });
    }

    if (shouldUpdate) {
      updateBaseline(obs).catch((err) =>
        logger.warn("Baseline update failed", { error: String(err) })
      );
    }

    return next();
  });
}
