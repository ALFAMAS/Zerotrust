import express from "express";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import swaggerUi from "swagger-ui-express";
import { initializeZeroAuth } from "..";
import authRoutes from "./routes/auth.routes";
import sessionRoutes from "./routes/session.routes";
import mfaRoutes from "./routes/mfa.routes";
import passkeyRoutes from "./routes/passkey.routes";
import adminRoutes from "./routes/admin.routes";
import passwordResetRoutes from "./routes/password-reset.routes";
import magicLinkRoutes from "./routes/magic-link.routes";
import oidcRoutes from "../oidc/routes";
import samlRoutes from "../saml/routes";
import { rateLimit } from "../middleware/rateLimiting";
import { geoFencingMiddleware } from "../middleware/geoFencing";
import { temporalAccessMiddleware } from "../middleware/temporalAccess";
import { authMiddleware } from "../middleware/auth";
import { securityHeaders } from "../middleware/securityHeaders";
import { resolveTenant } from "../middleware/tenant";
import { getLogger } from "../logger";
import { getElasticsearchHealth } from "../audit";
import { metricsMiddleware, metricsRoute } from "../metrics";
import { tracingMiddleware } from "../telemetry";
import webhookRoutes from "../webhooks/routes";

const logger = getLogger("api-server");

export async function createServer() {
  const { logger: initLogger } = await initializeZeroAuth();
  initLogger.info("Starting API server setup");

  const app = express();

  app.use(securityHeaders());
  app.use(tracingMiddleware());
  app.use(metricsMiddleware());
  app.use(helmet());
  app.use(cors());
  app.use(bodyParser.json());

  // Multi-tenant resolution (optional — no-op for single-tenant deployments)
  app.use(resolveTenant());

  // Auth routes
  app.use("/auth", authRoutes);
  app.use("/auth/password-reset", passwordResetRoutes);
  app.use("/auth/passkey", passkeyRoutes);
  app.use("/auth/mfa", mfaRoutes);
  app.use("/auth/magic-link", magicLinkRoutes);

  // Session management
  app.use("/sessions", sessionRoutes);

  // Admin routes
  app.use("/admin", adminRoutes);
  app.use("/admin/webhooks", webhookRoutes);

  // OIDC Provider (RFC 6749 + OIDC Core 1.0)
  app.use("/oidc", oidcRoutes);
  app.use("/.well-known/openid-configuration", (_req, res) =>
    res.redirect("/oidc/.well-known/openid-configuration")
  );

  // SAML 2.0 SP-initiated SSO
  app.use("/saml", samlRoutes);

  // Swagger UI
  try {
    const spec = require(path.resolve(__dirname, "./openapi.json"));
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));
  } catch (e) {
    logger.warn("Swagger UI not available", { error: String(e) });
  }

  // SSF webhook endpoint
  app.post("/ssf/events", async (req, res) => {
    try {
      const signature = req.headers["x-ssf-signature"] as string | undefined;
      const { verifySSFSignature } = await import("../ssf/verify");
      const ok = verifySSFSignature(req.body, signature);
      if (!ok)
        return res
          .status(401)
          .json({ code: "INVALID_SIGNATURE", message: "Invalid SSF signature", details: [] });

      const { handleSSFEvent } = await import("../ssf/receiver");
      const result = await handleSSFEvent(req.body);
      res.json(result);
    } catch (err) {
      logger.error("Failed to handle SSF event", err as Error);
      res
        .status(500)
        .json({ code: "INTERNAL_ERROR", message: "SSF event handling failed", details: [] });
    }
  });

  // Workload credential routes
  const workloadRoutes = await (async () => await import("./routes/workload.routes"));
  app.use("/workload", (workloadRoutes as any).default);

  // Protected example route chain
  app.get(
    "/protected",
    rateLimit({ points: 200, windowSecs: 60 }),
    authMiddleware,
    geoFencingMiddleware(),
    temporalAccessMiddleware(),
    (req, res) => {
      res.json({ ok: true, user: req.user?._id });
    }
  );

  // Prometheus metrics scrape endpoint
  app.get("/metrics", metricsRoute());

  // Health + readiness
  app.get("/healthz", async (req, res) => {
    const health: Record<string, string> = { status: "ok" };

    try {
      const { pingRedis } = await import("../services/rateLimiter/redis");
      health.redis = (await pingRedis()) ? "ok" : "down";
    } catch {
      health.redis = "unconfigured";
    }

    try {
      const esHealth = await getElasticsearchHealth();
      health.elasticsearch = esHealth.available ? esHealth.status : "down";
    } catch {
      health.elasticsearch = "unconfigured";
    }

    const allOk = Object.values(health).every(
      (v) => v === "ok" || v === "unconfigured" || v === "disabled"
    );
    res.status(allOk ? 200 : 503).json(health);
  });

  // Keep legacy /health path
  app.get("/health", async (_req, res) => res.redirect("/healthz"));

  return app;
}

if (require.main === module) {
  (async () => {
    const app = await createServer();
    const port = process.env.PORT || 3000;
    app.listen(port, () => logger.info(`Server listening on http://localhost:${port}`));
  })();
}
