/**
 * Device Attestation Middleware
 * Validates device fingerprint, detects compromised endpoints, and manages device trust
 */

import type { Request, Response, NextFunction } from "express";
import { FingerprintService } from "../services/fingerprint.service";
import { SessionModel } from "../models";
import { ErrorCodes, ZeroAuthError } from "../shared/types";
import { getLogger } from "../logger";

const logger = getLogger("device-attestation");

/**
 * Input interface for device data from client
 */
export interface DeviceAttestation {
  screenResolution?: string;
  timezone?: string;
  platform?: string;
  acceptLanguage?: string;
}

/**
 * Device attestation middleware
 * Compares current device fingerprint with session fingerprint
 * Flags anomalies for further verification
 */
export async function deviceAttestationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Skip if no user or session
    if (!req.user || !req.session) {
      next();
      return;
    }

    // Extract device data from headers
    const deviceAttestation: DeviceAttestation = {
      screenResolution: req.headers["x-screen-resolution"] as string | undefined,
      timezone: req.headers["x-timezone"] as string | undefined,
      platform: req.headers["x-platform"] as string | undefined,
      acceptLanguage: req.headers["accept-language"] as string | undefined,
    };

    // Compute current device fingerprint
    const currentFingerprint = FingerprintService.compute({
      userAgent: req.headers["user-agent"] || "",
      ip: req.ip || req.connection.remoteAddress || "",
      ...deviceAttestation,
    });

    const sessionFingerprint = req.session.deviceFingerprint;

    // Compare fingerprints
    const fingerprintMatch = currentFingerprint.hash === sessionFingerprint.hash;

    if (!fingerprintMatch) {
      logger.warn("Device fingerprint mismatch", {
        userId: req.user._id,
        sessionId: req.session._id,
        previousHash: sessionFingerprint.hash,
        currentHash: currentFingerprint.hash,
      });

      // Mark anomaly in session
      if (!req.session.anomalyFlags) {
        req.session.anomalyFlags = {
          deviceChangeDetected: false,
          locationChangeDetected: false,
          timeAnomalyDetected: false,
        };
      }
      req.session.anomalyFlags.deviceChangeDetected = true;

      // Update session with anomaly flag
      const session = await SessionModel.findByIdAndUpdate(
        req.session._id,
        {
          anomalyFlags: req.session.anomalyFlags,
        },
        { new: true }
      );

      if (session) {
        req.session = { ...session.toObject(), _id: session._id.toString() };
      }

      // Log detailed device change for audit
      logger.warn("Device change detected - potential compromise or multi-device access", {
        userId: req.user._id,
        sessionId: req.session._id,
        previousDevice: {
          browser: sessionFingerprint.browser,
          os: sessionFingerprint.os,
          platform: sessionFingerprint.platform,
        },
        currentDevice: {
          browser: currentFingerprint.browser,
          os: currentFingerprint.os,
          platform: currentFingerprint.platform,
        },
      });

      // In strict mode, challenge the user
      if (req.headers["x-device-attestation-strict"] === "true") {
        throw new ZeroAuthError(
          ErrorCodes.DEVICE_NOT_TRUSTED,
          "Device fingerprint has changed. Please re-authenticate.",
          403,
          { previousFingerprint: sessionFingerprint.hash, currentFingerprint: currentFingerprint.hash }
        );
      }
    }

    // Update device fingerprint last seen
    if (sessionFingerprint) {
      sessionFingerprint.lastSeenAt = new Date();
    }

    next();
  } catch (error) {
    if (error instanceof ZeroAuthError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        details: error.details,
      });
    } else {
      logger.error("Device attestation error", error as Error);
      res.status(500).json({
        error: "ATTESTATION_ERROR",
        message: "Device verification failed",
      });
    }
  }
}

/**
 * Require device to be marked as trusted
 * Device becomes trusted after successful biometric/MFA verification
 */
export async function requireTrustedDevice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.session?.deviceFingerprint?.isTrusted) {
      throw new ZeroAuthError(
        ErrorCodes.DEVICE_NOT_TRUSTED,
        "This operation requires a trusted device",
        403
      );
    }
    next();
  } catch (error) {
    if (error instanceof ZeroAuthError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
      });
    } else {
      res.status(500).json({
        error: "DEVICE_CHECK_ERROR",
        message: "Device trust check failed",
      });
    }
  }
}

/**
 * Mark current device as trusted
 * Called after successful biometric/MFA/identity verification
 */
export async function markDeviceAsTrusted(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.session) {
      throw new ZeroAuthError(
        ErrorCodes.SESSION_NOT_FOUND,
        "No active session",
        401
      );
    }

    // Update session to mark device as trusted
    const session = await SessionModel.findByIdAndUpdate(
      req.session._id,
      {
        "deviceFingerprint.isTrusted": true,
        "deviceFingerprint.lastSeenAt": new Date(),
      },
      { new: true }
    );

    if (session) {
      req.session = { ...session.toObject(), _id: session._id.toString() };
    }

    logger.info("Device marked as trusted", {
      userId: req.user?._id,
      sessionId: req.session._id,
    });

    next();
  } catch (error) {
    if (error instanceof ZeroAuthError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
      });
    } else {
      logger.error("Error marking device as trusted", error as Error);
      res.status(500).json({
        error: "DEVICE_TRUST_ERROR",
        message: "Failed to mark device as trusted",
      });
    }
  }
}
