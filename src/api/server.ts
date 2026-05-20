import express from "express";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import { initializeZeroAuth } from "..";
import authRoutes from "./routes/auth.routes";
import path from "path";
import swaggerUi from "swagger-ui-express";
import { rateLimit } from "../middleware/rateLimiting";
import { geoFencingMiddleware } from "../middleware/geoFencing";
import { temporalAccessMiddleware } from "../middleware/temporalAccess";
import { authMiddleware } from "../middleware/auth";
import { getLogger } from "../logger";

const logger = getLogger("api-server");

export async function createServer() {
  const { logger: initLogger } = await initializeZeroAuth();
  initLogger.info("Starting API server setup");

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(bodyParser.json());

  // Public auth routes
  app.use("/auth", authRoutes);

  // Swagger UI
  try {
    const spec = require(path.resolve(__dirname, "./openapi.json"));
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));
  } catch (e) {
    logger.warn("Swagger UI not available", e as Error);
  }

  // SSF webhook endpoint with signature validation
  app.post("/ssf/events", async (req, res) => {
    try {
      const signature = req.headers["x-ssf-signature"] as string | undefined;
      const { verifySSFSignature } = await import("../ssf/verify");
      const ok = verifySSFSignature(req.body, signature);
      if (!ok) return res.status(401).json({ error: "INVALID_SIGNATURE" });

      const { handleSSFEvent } = await import("../ssf/receiver");
      const result = await handleSSFEvent(req.body);
      res.json(result);
    } catch (err) {
      logger.error("Failed to handle SSF event", err as Error);
      res.status(500).json({ error: "INTERNAL_ERROR" });
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

  // Health
  app.get("/health", async (req, res) => {
    const health: any = { status: "ok" };
    try {
      const { pingRedis } = await import("../services/rateLimiter/redis");
      const ok = await pingRedis();
      health.redis = ok ? "ok" : "down";
    } catch (e) {
      health.redis = "unconfigured";
    }
    res.json(health);
  });

  return app;
}

if (require.main === module) {
  (async () => {
    const app = await createServer();
    const port = process.env.PORT || 3000;
    app.listen(port, () => logger.info(`Server listening on http://localhost:${port}`));
  })();
}
