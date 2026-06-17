import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { initializeZeroAuth } from "..";
import authRoutes from "./routes/auth.routes";
import passwordResetRoutes from "./routes/password-reset.routes";
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
import supportRoutes from "./routes/support.routes";
import emailEventRoutes from "./routes/email-events.routes";
import apiKeyRoutes from "./routes/api-keys.routes";
import billingRoutes from "./routes/billing.routes";
import billingWebhookRoutes from "./routes/billing.webhooks";
import adminToolsRoutes from "./routes/admin-tools.routes";
import webhookManagementRoutes from "../webhooks/routes";
import federationRoutes from "../federation/routes";
import didRoutes from "../did/routes";
import jitRoutes from "../jit/routes";
import scimRoutes from "../scim/routes";
import ldapRoutes from "../ldap/routes";
import oidcRoutes from "../oidc/routes";
import samlRoutes from "../saml/routes";
import tenantRoutes from "./routes/tenant.routes";
import { rateLimit } from "../middleware/rateLimiting";
import { geoFencingMiddleware } from "../middleware/geoFencing";
import { apiVersioning, API_VERSIONS, CURRENT_API_VERSION } from "../middleware/apiVersioning";
import { temporalAccessMiddleware } from "../middleware/temporalAccess";
import { authMiddleware } from "../middleware/auth";
import { getLogger } from "../logger";
import { initSentry } from "../instrument";
import { initEmailQueue } from "../services/emailQueue";
import { startRetentionScheduler } from "../services/dataRetention";
import { startNotificationEmailFallbackScheduler } from "../services/notificationEmailFallback";
import { startBillingLifecycleScheduler } from "../services/billingLifecycle.service";
import { startBackupScheduler } from "../services/dbBackup.service";
import { alertingMiddleware } from "../services/alerting.service";
import dotenv from "dotenv";

dotenv.config();

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

  // Trial expiry, dunning (D3/D7/D14) and win-back (D7/D30/D90) emails
  startBillingLifecycleScheduler(24);

  // Daily pg_dump backup when BACKUP_ENABLED=true
  startBackupScheduler(24);

  app.use("*", cors());
  app.use("*", secureHeaders());

  // API version negotiation + deprecation/sunset headers
  app.use("*", apiVersioning());

  // Public registry of supported API versions and their lifecycle status
  app.get("/api/versions", (c) =>
    c.json({ current: CURRENT_API_VERSION, versions: API_VERSIONS })
  );

  // Error-spike + latency alerting (Slack / Teams / PagerDuty)
  app.use("*", alertingMiddleware());

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

  // ─── Workload routes ──────────────────────────────────────────────────────
  app.route("/workload", workloadRoutes);

  // ─── Verification routes ──────────────────────────────────────────────────
  app.route("/auth/verify", verificationRoutes);

  // ─── Federation routes ────────────────────────────────────────────────────
  app.route("/federation", federationRoutes);

  // ─── Decentralized Identifier (DID) routes ────────────────────────────────
  // did:key + did:web resolver, challenge/verify proof-of-control.
  app.route("/auth/did", didRoutes);

  // ─── Cross-tenant JIT access routes ───────────────────────────────────────
  // Request + admin approval for temporary elevated access across tenants.
  app.route("/jit/cross-tenant", jitRoutes);

  // ─── Enterprise SSO & provisioning ────────────────────────────────────────
  // SCIM 2.0 user provisioning (Azure AD / Okta), routes are /Users, /Groups…
  app.route("/scim/v2", scimRoutes);
  // LDAP directory sync admin endpoints (/ldap/test, /ldap/sync…)
  app.route("/ldap", ldapRoutes);
  // OIDC provider: paths are self-prefixed (/.well-known/…, /oidc/…) → mount at root.
  app.route("/", oidcRoutes);
  // SAML SP: paths are self-prefixed (/saml/metadata, /saml/acs…) → mount at root.
  app.route("/", samlRoutes);
  // Tenant management (CRUD + per-tenant SSO config + plans).
  app.route("/admin/tenants", tenantRoutes);

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
  app.route("/support", supportRoutes);
  app.route("/webhooks/email", emailEventRoutes);

  // ─── API key routes ───────────────────────────────────────────────────────
  app.route("/api-keys", apiKeyRoutes);

  // ─── Billing routes ───────────────────────────────────────────────────────
  app.route("/billing", billingRoutes);
  app.route("/billing", billingWebhookRoutes);

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
    const contact = process.env.SECURITY_CONTACT ?? "mailto:security@example.com";
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

  // Public status page data — safe to expose (no internals, just up/down)
  const serverStartedAt = Date.now();
  app.get("/status", async (c) => {
    const components: Record<string, "operational" | "degraded" | "down"> = { api: "operational" };

    try {
      const { isDbConnected } = await import("../db/index.js");
      components.database = isDbConnected() ? "operational" : "down";
    } catch {
      components.database = "down";
    }

    try {
      const { pingRedis } = await import("../services/rateLimiter/redis.js");
      components.cache = (await pingRedis()) ? "operational" : "degraded";
    } catch {
      components.cache = "degraded";
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
    const port = parseInt(process.env.PORT || "1337");
    serve({ fetch: app.fetch, port }, (info) => {
      logger.info(`Server listening on http://localhost:${info.port}`);
    });
  })().catch((err: Error) => {
    logger.error("Server startup failed", err);
    process.exit(1);
  });
}
