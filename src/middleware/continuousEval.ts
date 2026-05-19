/**
 * Continuous Access Evaluation Middleware
 * Real-time ABAC evaluation with risk scoring and access decisions
 */

import type { Request, Response, NextFunction } from "express";
import type { AuthzContext, AuthzResult } from "../shared/types";
import { ErrorCodes, ZeroAuthError } from "../shared/types";
import { AuthorizationEngine } from "../services/authz.service";
import { SessionModel, AuditModel } from "../models";
import { getLogger } from "../logger";

const logger = getLogger("continuous-eval");

/**
 * Configuration for continuous evaluation
 */
export interface ContinuousEvalConfig {
  enableRiskScoring: boolean;
  riskThreshold: number; // 0-100, deny if risk >= threshold
  enableLocationAnomaly: boolean;
  locationAnomalyThreshold: number; // miles/km
  enableTimeAnomaly: boolean;
  anomalyAlertThreshold: number; // severity level 0-100
  requireStepUpAboveRisk: number; // require MFA if risk above this
}

const DEFAULT_CONFIG: ContinuousEvalConfig = {
  enableRiskScoring: true,
  riskThreshold: 85,
  enableLocationAnomaly: true,
  locationAnomalyThreshold: 500, // miles between last activity
  enableTimeAnomaly: true,
  anomalyAlertThreshold: 75,
  requireStepUpAboveRisk: 60,
};

const authzEngine = new AuthorizationEngine();

/**
 * Continuous access evaluation middleware
 * Evaluates access in real-time based on ABAC conditions and risk
 */
export async function continuousEvalMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
  config: Partial<ContinuousEvalConfig> = {}
): Promise<void> {
  try {
    // Skip if no user or session
    if (!req.user || !req.session) {
      next();
      return;
    }

    const evalConfig = { ...DEFAULT_CONFIG, ...config };

    // Extract resource and action from route
    const resource = extractResource(req);
    const action = extractAction(req);

    if (!resource || !action) {
      // No specific resource/action, allow through
      next();
      return;
    }

    // Build authorization context
    const authzContext: AuthzContext = {
      user: req.user,
      session: req.session,
      resource,
      action,
      environment: {
        currentTime: new Date(),
        currentIp: req.ip || req.connection.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        riskScore: 0, // Will be calculated
      },
    };

    // Calculate risk score
    let riskScore = 0;

    // Device anomaly risk
    if (req.session.anomalyFlags?.deviceChangeDetected) {
      riskScore += 25;
      logger.warn("Risk: Device change detected", {
        userId: req.user._id,
        sessionId: req.session._id,
      });
    }

    // Location anomaly risk
    if (evalConfig.enableLocationAnomaly && req.session.anomalyFlags?.locationChangeDetected) {
      riskScore += 30;
      logger.warn("Risk: Location anomaly detected", {
        userId: req.user._id,
        sessionId: req.session._id,
      });
    }

    // Time-based anomaly risk
    if (evalConfig.enableTimeAnomaly && req.session.anomalyFlags?.timeAnomalyDetected) {
      riskScore += 20;
      logger.warn("Risk: Time-based anomaly detected", {
        userId: req.user._id,
        sessionId: req.session._id,
      });
    }

    // Evaluate ABAC conditions
    const authzResult = await authzEngine.evaluate(authzContext);

    // Store risk score in context
    authzContext.environment.riskScore = riskScore + (authzResult.riskScore || 0);
    authzContext.environment.riskScore = Math.min(100, authzContext.environment.riskScore);

    // Update session with continuous eval result
    await SessionModel.findByIdAndUpdate(
      req.session._id,
      {
        continuousEvalResult: {
          decision: authzResult.decision === "allow" ? "allow" : "deny",
          riskScore: authzContext.environment.riskScore,
          evaluatedAt: new Date(),
        },
      }
    );

    // Log access decision
    await AuditModel.create({
      action: `ACCESS_EVAL_${resource}_${action}`,
      actorId: req.user._id,
      actorEmail: req.user.email,
      targetId: resource,
      targetType: "resource",
      ipAddress: authzContext.environment.currentIp,
      userAgent: authzContext.environment.userAgent,
      sessionId: req.session._id.toString(),
      success: authzResult.decision === "allow",
      riskScore: authzContext.environment.riskScore,
      continuousEvalContext: {
        decision: authzResult.decision,
        reason: authzResult.reason,
        requiresMFA: authzResult.requiresMFA,
        anomalyFlags: req.session.anomalyFlags,
      },
      timestamp: new Date(),
    });

    // Check risk threshold
    if (authzContext.environment.riskScore >= evalConfig.riskThreshold) {
      logger.error("Access denied due to high risk score", {
        userId: req.user._id,
        sessionId: req.session._id,
        riskScore: authzContext.environment.riskScore,
        threshold: evalConfig.riskThreshold,
      });

      throw new ZeroAuthError(
        ErrorCodes.ACCESS_DENIED,
        "Access denied due to suspicious activity. Please re-authenticate.",
        403,
        { riskScore: authzContext.environment.riskScore, threshold: evalConfig.riskThreshold }
      );
    }

    // Check ABAC result
    if (authzResult.decision === "deny") {
      logger.warn("Access denied by ABAC policy", {
        userId: req.user._id,
        resource,
        action,
        reason: authzResult.reason,
      });

      throw new ZeroAuthError(
        ErrorCodes.ACCESS_DENIED,
        authzResult.reason || "Access denied by policy",
        403
      );
    }

    // Require step-up if risk is elevated
    if (authzContext.environment.riskScore >= evalConfig.requireStepUpAboveRisk) {
      if (!req.headers["x-step-up-verified"]) {
        logger.warn("Step-up authentication required", {
          userId: req.user._id,
          sessionId: req.session._id,
          riskScore: authzContext.environment.riskScore,
        });

        throw new ZeroAuthError(
          ErrorCodes.MFA_REQUIRED,
          "Additional verification required for this operation",
          403,
          {
            riskScore: authzContext.environment.riskScore,
            threshold: evalConfig.requireStepUpAboveRisk,
          }
        );
      }
    }

    // Attach evaluation result to request
    req.continuousEvalResult = authzResult;

    logger.debug("Access evaluation passed", {
      userId: req.user._id,
      resource,
      action,
      riskScore: authzContext.environment.riskScore,
    });

    next();
  } catch (error) {
    if (error instanceof ZeroAuthError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        details: error.details,
      });
    } else {
      logger.error("Continuous evaluation error", error as Error);
      res.status(500).json({
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Access evaluation failed",
      });
    }
  }
}

/**
 * Extract resource from request route
 * Example: /api/files/:id -> "files"
 */
function extractResource(req: Request): string | null {
  const parts = req.path.split("/").filter(Boolean);
  if (parts.length > 1) {
    return parts[1]; // e.g., "files", "users", "config"
  }
  return null;
}

/**
 * Extract action from HTTP method
 */
function extractAction(req: Request): string | null {
  const methodMap: Record<string, string> = {
    GET: "read",
    POST: "create",
    PUT: "update",
    PATCH: "update",
    DELETE: "delete",
  };
  return methodMap[req.method] || null;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      continuousEvalResult?: {
        decision: "allow" | "deny";
        reason?: string;
        requiresMFA?: boolean;
        riskScore?: number;
      };
    }
  }
}

/**
 * Create continuous evaluation middleware factory
 * Allows custom config per route
 */
export function createContinuousEvalMiddleware(
  config?: Partial<ContinuousEvalConfig>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    return continuousEvalMiddleware(req, res, next, config);
  };
}
