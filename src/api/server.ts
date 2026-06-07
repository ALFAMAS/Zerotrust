import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { initializeZeroAuth } from "..";
import authRoutes from "./routes/auth.routes";
import magicLinkRoutes from "./routes/magic-link.routes";
import mfaRoutes from "./routes/mfa.routes";
import sessionRoutes from "./routes/session.routes";
import adminRoutes from "./routes/admin.routes";
import passkeyRoutes from "./routes/passkey.routes";
import workloadRoutes from "./routes/workload.routes";
import verificationRoutes from "./routes/verification.routes";
import anomalyRoutes from "./routes/anomaly.routes";
import notificationRoutes from "./routes/notification.routes";
import orgRoutes from "./routes/org.routes";
import gdprRoutes from "./routes/gdpr.routes";
import unsubscribeRoutes from "./routes/unsubscribe.routes";
import feedbackRoutes from "./routes/feedback.routes";
import federationRoutes from "../federation/routes";
import { rateLimit } from "../middleware/rateLimiting";
import { geoFencingMiddleware } from "../middleware/geoFencing";
import { temporalAccessMiddleware } from "../middleware/temporalAccess";
import { authMiddleware } from "../middleware/auth";
import { getLogger } from "../logger";
import { initSentry } from "../instrument";
import { initEmailQueue } from "../services/emailQueue";
import { startRetentionScheduler } from "../services/dataRetention";
import { startNotificationEmailFallbackScheduler } from "../services/notificationEmailFallback";
import type { HonoEnv } from "../shared/types";

const logger = getLogger("api-server");

export async function createServer() {
  initSentry();
  const { logger: initLogger } = await initializeZeroAuth();
  initLogger.info("Starting API server setup");

  const app = new Hono<HonoEnv>();

  // Start email queue worker when Redis is available
  if (process.env.REDIS_URI) {
    initEmailQueue(process.env.REDIS_URI).catch((err: Error) =>
      initLogger.error("Email queue init failed", err)
    );
  }

  // Start data retention scheduler (runs once every 24h)
  startRetentionScheduler(24);

  // Send notification email fallbacks to inactive users (runs every 24h)
  startNotificationEmailFallbackScheduler(24);

  app.use("*", cors());
  app.use("*", secureHeaders());

  // ─── Static uploads (avatars, etc.) ──────────────────────────────────────
  app.use("/uploads/*", serveStatic({ root: "./" }));

  // ─── Auth routes ──────────────────────────────────────────────────────────
  app.route("/auth", authRoutes);
  app.route("/auth", unsubscribeRoutes);
  app.route("/auth/magic-link", magicLinkRoutes);
  app.route("/auth/mfa", mfaRoutes);
  app.route("/auth/passkey", passkeyRoutes);

  // ─── Session routes ───────────────────────────────────────────────────────
  app.route("/sessions", sessionRoutes);

  // ─── Admin routes ─────────────────────────────────────────────────────────
  app.route("/admin", adminRoutes);

  // ─── Workload routes ──────────────────────────────────────────────────────
  app.route("/workload", workloadRoutes);

  // ─── Verification routes ──────────────────────────────────────────────────
  app.route("/auth/verify", verificationRoutes);

  // ─── Federation routes ────────────────────────────────────────────────────
  app.route("/federation", federationRoutes);

  // ─── Anomaly admin routes ─────────────────────────────────────────────────
  app.route("/admin/anomaly", anomalyRoutes);

  // ─── Notification routes ──────────────────────────────────────────────────
  app.route("/notifications", notificationRoutes);

  // ─── Organization routes ──────────────────────────────────────────────────
  app.route("/orgs", orgRoutes);

  // ─── GDPR routes ──────────────────────────────────────────────────────────
  app.route("/gdpr", gdprRoutes);

  // ─── Feedback routes ──────────────────────────────────────────────────────
  app.route("/feedback", feedbackRoutes);

  // ─── SSF webhook endpoint ─────────────────────────────────────────────────
  app.post("/ssf/events", async (c) => {
    try {
      const signature = c.req.header("x-ssf-signature");
      const body = await c.req.json();
      const { verifySSFSignature } = await import("../ssf/verify.js");
      const ok = verifySSFSignature(body, signature);
      if (!ok) return c.json({ error: "INVALID_SIGNATURE" }, 401);

      const { handleSSFEvent } = await import("../ssf/receiver.js");
      const result = await handleSSFEvent(body);
      return c.json(result);
    } catch (err) {
      logger.error("Failed to handle SSF event", err as Error);
      return c.json({ error: "INTERNAL_ERROR" }, 500);
    }
  });

  // ─── Protected example route ──────────────────────────────────────────────
  app.get(
    "/protected",
    rateLimit({ points: 200, windowSecs: 60 }),
    authMiddleware,
    geoFencingMiddleware(),
    temporalAccessMiddleware(),
    (c) => {
      return c.json({ ok: true, user: c.get("user")?.id });
    }
  );

  // ─── Health checks ────────────────────────────────────────────────────────
  app.get("/health", async (c) => {
    const health: Record<string, unknown> = { status: "ok" };
    try {
      const { pingRedis } = await import("../services/rateLimiter/redis.js");
      health.redis = (await pingRedis()) ? "ok" : "down";
    } catch {
      health.redis = "unconfigured";
    }
    return c.json(health);
  });

  app.get("/healthz", async (c) => {
    const health: Record<string, unknown> = { status: "ok", timestamp: new Date().toISOString() };

    try {
      const { pingRedis } = await import("../services/rateLimiter/redis.js");
      health.redis = (await pingRedis()) ? "ok" : "down";
    } catch {
      health.redis = "unconfigured";
    }

    try {
      const { isDbConnected } = await import("../db/index.js");
      health.postgres = isDbConnected() ? "ok" : "down";
    } catch {
      health.postgres = "unknown";
    }

    try {
      const { getSettings } = await import("../models/settings.model.js");
      const settings = await getSettings();
      health.settings = { appName: settings.appName };
    } catch {
      health.settings = "unavailable";
    }

    const httpStatus = health.postgres === "ok" ? 200 : 503;
    return c.json(health, httpStatus as any);
  });

  return app;
}

if (require.main === module) {
  (async () => {
    const app = await createServer();
    const port = parseInt(process.env.PORT || "3000");
    serve({ fetch: app.fetch, port }, (info) => {
      logger.info(`Server listening on http://localhost:${info.port}`);
    });
  })().catch((err: Error) => {
    logger.error("Server startup failed", err);
    process.exit(1);
  });
}
