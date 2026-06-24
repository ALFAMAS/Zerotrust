import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getDb } from "../db";
import { sessionsTable } from "../db/schema";
import { getLogger } from "../logger";
import { FingerprintService } from "../services/fingerprint.service";
import type { HonoEnv } from "../shared/types";
import { ErrorCodes, zerotrustError } from "../shared/types";

const logger = getLogger("device-attestation");

export const deviceAttestationMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  try {
    const user = c.get("user");
    const session = c.get("session");
    if (!user || !session) return next();

    const currentFingerprint = FingerprintService.compute({
      userAgent: c.req.header("user-agent") || "",
      ip: c.req.header("x-forwarded-for")?.split(",")[0].trim() || "",
      screenResolution: c.req.header("x-screen-resolution"),
      timezone: c.req.header("x-timezone"),
      platform: c.req.header("x-platform"),
      acceptLanguage: c.req.header("accept-language"),
    });

    const sessionFingerprint = session.deviceFingerprint;
    const fingerprintMatch = currentFingerprint.hash === sessionFingerprint?.hash;

    if (!fingerprintMatch) {
      logger.warn("Device fingerprint mismatch", {
        userId: user.id,
        sessionId: session.id,
      });

      const anomalyFlags = {
        ...((session.anomalyFlags as any) || {
          deviceChangeDetected: false,
          locationChangeDetected: false,
          timeAnomalyDetected: false,
        }),
        deviceChangeDetected: true,
      };

      const db = getDb();
      await db
        .update(sessionsTable)
        .set({ anomalyFlags, updatedAt: new Date() })
        .where(eq(sessionsTable.id, session.id));

      if (c.req.header("x-device-attestation-strict") === "true") {
        throw new zerotrustError(
          ErrorCodes.DEVICE_NOT_TRUSTED,
          "Device fingerprint has changed. Please re-authenticate.",
          403
        );
      }
    }

    return next();
  } catch (error) {
    if (error instanceof zerotrustError) {
      return c.json({ error: error.code, message: error.message }, error.statusCode as any);
    }
    logger.error("Device attestation error", error as Error);
    return c.json({ error: "ATTESTATION_ERROR", message: "Device verification failed" }, 500);
  }
});

export const requireTrustedDevice = createMiddleware<HonoEnv>(async (c, next) => {
  const session = c.get("session");
  if (!(session?.deviceFingerprint as any)?.isTrusted) {
    return c.json(
      {
        error: ErrorCodes.DEVICE_NOT_TRUSTED,
        message: "This operation requires a trusted device",
      },
      403
    );
  }
  return next();
});

export const markDeviceAsTrusted = createMiddleware<HonoEnv>(async (c, next) => {
  try {
    const session = c.get("session");
    if (!session) {
      return c.json({ error: ErrorCodes.SESSION_NOT_FOUND, message: "No active session" }, 401);
    }

    const db = getDb();
    const currentFingerprint = (session.deviceFingerprint as any) || {};
    await db
      .update(sessionsTable)
      .set({
        deviceFingerprint: {
          ...currentFingerprint,
          isTrusted: true,
          lastSeenAt: new Date(),
        },
        updatedAt: new Date(),
      })
      .where(eq(sessionsTable.id, session.id));

    logger.info("Device marked as trusted", {
      userId: c.get("user")?.id,
      sessionId: session.id,
    });
    return next();
  } catch (error) {
    if (error instanceof zerotrustError) {
      return c.json({ error: error.code, message: error.message }, error.statusCode as any);
    }
    logger.error("Error marking device as trusted", error as Error);
    return c.json(
      {
        error: "DEVICE_TRUST_ERROR",
        message: "Failed to mark device as trusted",
      },
      500
    );
  }
});
