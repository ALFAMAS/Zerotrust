import { createMiddleware } from "hono/factory";
import type { AuthzContext, HonoEnv } from "../shared/types";
import { ErrorCodes, ZeroAuthError } from "../shared/types";
import { AuthorizationEngine } from "../services/authz.service";
import { getDb } from "../db";
import { sessionsTable, auditLogsTable } from "../db/schema";
import { eq } from "drizzle-orm";
import { getLogger } from "../logger";

const logger = getLogger("continuous-eval");

export interface ContinuousEvalConfig {
  enableRiskScoring: boolean;
  riskThreshold: number;
  enableLocationAnomaly: boolean;
  locationAnomalyThreshold: number;
  enableTimeAnomaly: boolean;
  anomalyAlertThreshold: number;
  requireStepUpAboveRisk: number;
}

const DEFAULT_CONFIG: ContinuousEvalConfig = {
  enableRiskScoring: true,
  riskThreshold: 85,
  enableLocationAnomaly: true,
  locationAnomalyThreshold: 500,
  enableTimeAnomaly: true,
  anomalyAlertThreshold: 75,
  requireStepUpAboveRisk: 60,
};

const authzEngine = new AuthorizationEngine();

export function createContinuousEvalMiddleware(config?: Partial<ContinuousEvalConfig>) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    try {
      const user = c.get("user");
      const session = c.get("session");
      if (!user || !session) return next();

      const evalConfig = { ...DEFAULT_CONFIG, ...config };
      const resource = extractResource(c.req.path);
      const action = extractAction(c.req.method);
      if (!resource || !action) return next();

      const authzContext: AuthzContext = {
        user,
        session,
        resource,
        action,
        environment: {
          currentTime: new Date(),
          currentIp: c.req.header("x-forwarded-for")?.split(",")[0].trim() || "",
          userAgent: c.req.header("user-agent") || "",
          riskScore: 0,
        },
      };

      let riskScore = 0;
      const anomalyFlags = session.anomalyFlags as any;

      if (anomalyFlags?.deviceChangeDetected) riskScore += 25;
      if (evalConfig.enableLocationAnomaly && anomalyFlags?.locationChangeDetected) riskScore += 30;
      if (evalConfig.enableTimeAnomaly && anomalyFlags?.timeAnomalyDetected) riskScore += 20;

      const authzResult = await authzEngine.evaluate(authzContext);
      authzContext.environment.riskScore = Math.min(100, riskScore + (authzResult.riskScore || 0));

      const db = getDb();
      await db.update(sessionsTable)
        .set({
          continuousEvalResult: {
            decision: authzResult.decision === "allow" ? "allow" : "deny",
            riskScore: authzContext.environment.riskScore,
            evaluatedAt: new Date(),
          },
          updatedAt: new Date(),
        })
        .where(eq(sessionsTable.id, session.id));

      await db.insert(auditLogsTable).values({
        action: `ACCESS_EVAL_${resource}_${action}`,
        actorId: user.id,
        actorEmail: user.email,
        targetId: resource,
        targetType: "resource",
        ipAddress: authzContext.environment.currentIp,
        userAgent: authzContext.environment.userAgent,
        sessionId: session.id,
        success: authzResult.decision === "allow",
        riskScore: authzContext.environment.riskScore,
      });

      if (authzContext.environment.riskScore >= evalConfig.riskThreshold) {
        throw new ZeroAuthError(
          ErrorCodes.ACCESS_DENIED,
          "Access denied due to suspicious activity. Please re-authenticate.",
          403,
          { riskScore: authzContext.environment.riskScore }
        );
      }

      if (authzResult.decision === "deny") {
        throw new ZeroAuthError(ErrorCodes.ACCESS_DENIED, authzResult.reason || "Access denied by policy", 403);
      }

      if (
        authzContext.environment.riskScore >= evalConfig.requireStepUpAboveRisk &&
        !c.req.header("x-step-up-verified")
      ) {
        throw new ZeroAuthError(ErrorCodes.MFA_REQUIRED, "Additional verification required", 403, {
          riskScore: authzContext.environment.riskScore,
        });
      }

      return next();
    } catch (error) {
      if (error instanceof ZeroAuthError) {
        return c.json({ error: error.code, message: error.message, details: error.details }, error.statusCode as any);
      }
      logger.error("Continuous evaluation error", error as Error);
      return c.json({ error: ErrorCodes.INTERNAL_ERROR, message: "Access evaluation failed" }, 500);
    }
  });
}

function extractResource(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 1 ? parts[1] : null;
}

function extractAction(method: string): string | null {
  const map: Record<string, string> = { GET: "read", POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" };
  return map[method] || null;
}
