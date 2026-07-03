import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import dotenv from "dotenv";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { securityHeaders } from "../middleware/securityHeaders";
import { initializezerotrust } from "..";
import { initSentry } from "../instrument";
import jitRoutes from "../jit/routes";
import { startJobScheduler } from "../jobs/scheduler";
import {
  resolveBackgroundJobTopology,
  warnIfApiRunsSchedulersInProduction,
} from "../jobs/topology";
import { getLogger } from "../logger";
import { metricsAuthMiddleware, metricsMiddleware, metricsRoute } from "../metrics";
import { API_VERSIONS, apiVersioning, CURRENT_API_VERSION } from "../middleware/apiVersioning";
import { authMiddleware, requireAdmin } from "../middleware/auth";
import { corsOptionsFromEnv } from "../middleware/cors";
import { geoFencingMiddleware } from "../middleware/geoFencing";
import { rateLimit } from "../middleware/rateLimiting";
import { temporalAccessMiddleware } from "../middleware/temporalAccess";
import notificationChannelRoutes from "../notifications/routes";
import {
  initStripeWebhookQueueConsumer,
  initStripeWebhookQueueProducer,
} from "../services/billing/stripeWebhookQueue";
import { initEmailQueue } from "../services/notifications/emailQueue";
import { alertingMiddleware } from "../services/ops/alerting.service";
import { sloAlertingMiddleware, sloRouteHandler } from "../services/ops/slo.service";
import { initTelemetry, telemetryMiddleware } from "../telemetry";
import webhookManagementRoutes from "../webhooks/routes";
import accessReviewRoutes from "./routes/access-review.routes";
import adminRoutes from "./routes/admin.routes";
import adminToolsRoutes from "./routes/admin-tools.routes";
import anomalyRoutes from "./routes/anomaly.routes";
import apiKeyRoutes from "./routes/api-keys.routes";
import authRoutes from "./routes/auth.routes";
import billingRoutes from "./routes/billing.routes";
import billingWebhookRoutes from "./routes/billing.webhooks";
import complianceRoutes from "./routes/compliance.routes";
import emailEventRoutes from "./routes/email-events.routes";
import feedbackRoutes from "./routes/feedback.routes";
import gdprRoutes from "./routes/gdpr.routes";
import globalizationRoutes from "./routes/globalization.routes";
import magicLinkRoutes from "./routes/magic-link.routes";
import mfaRoutes from "./routes/mfa.routes";
import notificationRoutes from "./routes/notification.routes";
import orgRoutes from "./routes/org.routes";
import passkeyRoutes from "./routes/passkey.routes";
import passwordResetRoutes from "./routes/password-reset.routes";
import regionRoutes from "./routes/region.routes";
import searchRoutes from "./routes/search.routes";
import sessionRoutes from "./routes/session.routes";
import supportRoutes from "./routes/support.routes";
import unsubscribeRoutes from "./routes/unsubscribe.routes";
import verificationRoutes from "./routes/verification.routes";
import walletRoutes from "./routes/wallet.routes";

dotenv.config();

import { inputSanitizationMiddleware } from "../middleware/inputSanitization";
import type { HonoEnv } from "../shared/types";
import { registerGlobalErrorHandler } from "./errorHandler";

const logger = getLogger("api-server");
export async function createServer() {
  initSentry();
  initTelemetry();
  const { logger: initLogger } = await initializezerotrust();
  initLogger.info("Starting API server setup");

  const app = new Hono<HonoEnv>();
  registerGlobalErrorHandler(app, logger);

  // Background jobs: when a dedicated worker process is running, defer all
  // BullMQ schedulers/consumers (email queue + scheduled jobs) to it. In
  // local dev / single-server deploys without WORKER_MODE, start them
  // in-process as before.
  const jobTopology = resolveBackgroundJobTopology(process.env);
  warnIfApiRunsSchedulersInProduction(initLogger, jobTopology);

  // Stripe webhooks always arrive at this (API) process, so the queue
  // producer must be available here regardless of WORKER_MODE.
  if (process.env.REDIS_URI) {
    initStripeWebhookQueueProducer(process.env.REDIS_URI);
  }

  if (jobTopology.startInApiProcess) {
    // Start email queue worker when Redis is available
    if (process.env.REDIS_URI) {
      initEmailQueue(process.env.REDIS_URI).catch((err: Error) =>
        initLogger.error("Email queue init failed", err)
      );
      // Single-process deployment: this process also consumes queued Stripe
      // webhook jobs (the dedicated worker takes over when WORKER_MODE=true).
      initStripeWebhookQueueConsumer(process.env.REDIS_URI);
    }

    // Start all scheduled jobs via the BullMQ-backed scheduler
    startJobScheduler().catch((err: Error) =>
      initLogger.error("Scheduled job scheduler init failed", err)
    );
    initLogger.info("Background jobs started in API process (WORKER_MODE not set)");
  } else {
    initLogger.info("Background jobs deferred to dedicated worker (WORKER_MODE=true)");
  }

  app.use("*", cors(corsOptionsFromEnv()));
  app.use("*", securityHeaders());
  app.use("*", inputSanitizationMiddleware());
  // Compress JSON, HTML, and text responses to reduce transfer time for dashboard/API reads.
  // Bun is pinned to >= 1.3, where `CompressionStream` is available.
  app.use("*", compress());
  app.use("*", metricsMiddleware());
  app.use("*", telemetryMiddleware());

  // API version negotiation + deprecation/sunset headers
  app.use("*", apiVersioning());

  // Public registry of supported API versions and their lifecycle status
  app.get("/api/versions", (c) => c.json({ current: CURRENT_API_VERSION, versions: API_VERSIONS }));

  // Prometheus scrape endpoint. Open by default for scraper compatibility;
  // set METRICS_AUTH_TOKEN to require `Authorization: Bearer <token>`.
  app.get("/metrics", metricsAuthMiddleware(), metricsRoute);

  // Error-spike + latency alerting (Slack / Teams / PagerDuty)
  app.use("*", alertingMiddleware());

  // SLO burn-rate alerting (debounced, checks Prometheus metrics)
  app.use("*", sloAlertingMiddleware());

  // SLO status endpoint — current error budget + burn rates.
  // Guarded: lives under /admin/* and exposes internal reliability metrics, so
  // it must require an authenticated admin like the rest of the namespace.
  app.get("/admin/slo", authMiddleware, requireAdmin, sloRouteHandler);

  // ─── Static uploads (avatars, etc.) ──────────────────────────────────────
  app.use("/uploads/*", serveStatic({ root: "./" }));

  // ─── Auth routes ──────────────────────────────────────────────────────────
  app.route("/auth", authRoutes);
  app.route("/auth", unsubscribeRoutes);
  app.route("/auth/password-reset", passwordResetRoutes);
  app.route("/auth/magic-link", magicLinkRoutes);
  app.route("/auth/mfa", mfaRoutes);
  app.route("/auth/passkey", passkeyRoutes);

  // ─── Session routes ───────────────────────────────────────────────────────
  app.route("/sessions", sessionRoutes);

  // ─── Admin routes ─────────────────────────────────────────────────────────
  app.route("/admin", adminRoutes);
  app.route("/admin", adminToolsRoutes);
  app.route("/admin/access-reviews", accessReviewRoutes);

  // ─── Verification routes ──────────────────────────────────────────────────
  app.route("/auth/verify", verificationRoutes);

  // ─── Cross-tenant JIT access routes ───────────────────────────────────────
  // Request + admin approval for temporary elevated access across tenants.
  app.route("/jit/cross-tenant", jitRoutes);

  // ─── Anomaly admin routes ─────────────────────────────────────────────────
  app.route("/admin/anomaly", anomalyRoutes);

  // ─── Notification routes ──────────────────────────────────────────────────
  // User-facing in-app / SSE / web-push notifications.
  app.route("/notifications", notificationRoutes);
  // Admin-only alerting-channel management (Slack / Teams / PagerDuty). The
  // router self-guards with authMiddleware + an admin-role check.
  app.route("/admin/notifications", notificationChannelRoutes);

  // ─── Organization routes ──────────────────────────────────────────────────
  app.route("/orgs", orgRoutes);

  // ─── GDPR routes ──────────────────────────────────────────────────────────
  app.route("/gdpr", gdprRoutes);

  // ─── Feedback routes ──────────────────────────────────────────────────────
  app.route("/feedback", feedbackRoutes);
  app.route("/support", supportRoutes);
  app.route("/webhooks/email", emailEventRoutes);

  // ─── API key routes ───────────────────────────────────────────────────────
  app.route("/api-keys", apiKeyRoutes);

  // ─── Billing routes ───────────────────────────────────────────────────────
  app.route("/billing", billingRoutes);
  app.route("/billing", billingWebhookRoutes);
  // Multi-currency pricing, PPP, location tax, EU VAT + tax-exemption endpoints.
  app.route("/billing", globalizationRoutes);

  // ─── Region / tenant routes ────────────────────────────────────────────────
  // Custom domain resolution, per-org branding, data residency.
  app.route("/regions", regionRoutes);

  // ─── Search routes ─────────────────────────────────────────────────────────
  // Full-text search (Elasticsearch) + ranked smart search.
  app.route("/search", searchRoutes);

  // ─── Wallet, Loyalty, Referral, Gamification ──────────────────────────────
  // Wallet.
  app.route("/wallet", walletRoutes);

  // ─── Compliance ────────────────────────────────────────────────────────────
  // SOC 2 readiness + controls, risk assessment.
  app.route("/compliance", complianceRoutes);

  // ─── User-facing webhook management (developer feature) ──────────────────
  app.route("/webhooks", webhookManagementRoutes);

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

  // ─── Responsible disclosure (RFC 9116) ──────────────────────────────────────
  const securityTxt = () => {
    const contact = process.env.SECURITY_CONTACT ?? "mailto:arafat0951@gmail.com";
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    return [
      `Contact: ${contact}`,
      `Expires: ${expires}`,
      `Policy: ${appUrl}/security`,
      "Preferred-Languages: en",
      "",
    ].join("\n");
  };
  app.get("/.well-known/security.txt", (c) => c.text(securityTxt()));
  app.get("/security.txt", (c) => c.text(securityTxt()));

  // ─── Health checks ────────────────────────────────────────────────────────

  // Public status page data — safe to expose (no internals, just up/down)
  const serverStartedAt = Date.now();
  app.get("/status", async (c) => {
    const components: Record<string, "operational" | "degraded" | "down" | "not set"> = {
      api: "operational",
    };

    try {
      const { isDbConnected } = await import("../db/index.js");
      components.database = isDbConnected() ? "operational" : "down";
    } catch {
      components.database = "down";
    }

    try {
      const { pingRedis } = await import("../services/shared/rateLimiter/redis.js");
      components.cache = (await pingRedis()) ? "operational" : "degraded";
    } catch {
      components.cache = "degraded";
    }

    // S3 backup + object storage share the same bucket and credentials, so a
    // single ping covers both. We surface them as two components — DB backups
    // (backups/ prefix) and user object storage (uploads/ prefix) — so operators
    // can see each feature independently. When `BACKUP_S3_BUCKET` is unset we
    // render an explicit "not set" state (greyed out on the UI) so they show as
    // components without false alarms; a failed ping stays "down" so broken
    // credentials / DNS / bucket policy are still loud.
    let s3Enabled = false;
    try {
      const { isS3BackupEnabled, pingS3WithTimeout } = await import(
        "../services/ops/objectStorage.service.js"
      );
      s3Enabled = isS3BackupEnabled();
      if (s3Enabled) {
        const result = await pingS3WithTimeout();
        const state = result.ok ? "operational" : "down";
        components.s3Backup = state;
        components.s3ObjectStorage = state;
      } else {
        components.s3Backup = "not set";
        components.s3ObjectStorage = "not set";
      }
    } catch {
      const state = s3Enabled ? "down" : "not set";
      components.s3Backup = state;
      components.s3ObjectStorage = state;
    }

    const overall = Object.values(components).includes("down")
      ? "down"
      : Object.values(components).includes("degraded")
        ? "degraded"
        : "operational";

    return c.json({
      status: overall,
      components,
      uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  // SSE stream for real-time status updates
  app.get("/status/stream", () => {
    let cleanupFn: (() => void) | undefined;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        const sendStatus = async () => {
          try {
            const components: Record<string, "operational" | "degraded" | "down" | "not set"> = {
              api: "operational",
            };
            try {
              const { isDbConnected } = await import("../db/index.js");
              components.database = isDbConnected() ? "operational" : "down";
            } catch {
              components.database = "down";
            }
            try {
              const { pingRedis } = await import("../services/shared/rateLimiter/redis.js");
              components.cache = (await pingRedis()) ? "operational" : "degraded";
            } catch {
              components.cache = "degraded";
            }
            let s3Enabled = false;
            try {
              const { isS3BackupEnabled, pingS3WithTimeout } = await import(
                "../services/ops/objectStorage.service.js"
              );
              s3Enabled = isS3BackupEnabled();
              if (s3Enabled) {
                const ping = await pingS3WithTimeout(4000);
                components.s3Backup = ping.ok ? "operational" : "down";
                components.s3ObjectStorage = ping.ok ? "operational" : "down";
              } else {
                components.s3Backup = "not set";
                components.s3ObjectStorage = "not set";
              }
            } catch {
              components.s3Backup = s3Enabled ? "down" : "not set";
              components.s3ObjectStorage = s3Enabled ? "down" : "not set";
            }
            const overall: "operational" | "degraded" | "down" = Object.values(components).includes(
              "down"
            )
              ? "down"
              : Object.values(components).includes("degraded")
                ? "degraded"
                : "operational";
            const data = JSON.stringify({
              status: overall,
              components,
              uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
              timestamp: new Date().toISOString(),
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            /* ignore */
          }
        };

        // Send initial status
        void sendStatus();

        // Broadcast every 30s
        const interval = setInterval(sendStatus, 30_000);
        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            clearInterval(pingInterval);
            clearInterval(interval);
          }
        }, 30_000);

        cleanupFn = () => {
          clearInterval(interval);
          clearInterval(pingInterval);
        };
      },
      cancel() {
        cleanupFn?.();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });

  app.get("/health", async (c) => {
    const health: Record<string, unknown> = {
      status: "ok",
      timestamp: new Date().toISOString(),
    };

    try {
      const { pingRedis } = await import("../services/shared/rateLimiter/redis.js");
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

    // S3 backup: always surface state. "not set" when BACKUP_S3_BUCKET is unset;
    // a broken backup must not pull the API out of rotation (mirrors the Redis
    // "down but still 200" pattern above) — postgres is the only component that
    // flips the HTTP status.
    let s3Enabled = false;
    try {
      const { isS3BackupEnabled, pingS3WithTimeout } = await import(
        "../services/ops/objectStorage.service.js"
      );
      s3Enabled = isS3BackupEnabled();
      if (s3Enabled) {
        const result = await pingS3WithTimeout();
        health.s3Backup = result.ok ? "ok" : "down";
      } else {
        health.s3Backup = "not set";
      }
    } catch {
      health.s3Backup = s3Enabled ? "down" : "not set";
    }

    const httpStatus = health.postgres === "ok" ? 200 : 503;
    return c.json(health, httpStatus);
  });

  return app;
}

if (require.main === module) {
  (async () => {
    const app = await createServer();
    const port = parseInt(process.env.PORT || "1337", 10);
    serve({ fetch: app.fetch, port }, (info) => {
      logger.info(`Server listening on http://localhost:${info.port}`);
    });
  })().catch((err: Error) => {
    logger.error("Server startup failed", err);
    process.exit(1);
  });
}
