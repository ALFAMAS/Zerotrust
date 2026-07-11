import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth";
import { orgRlsMiddleware } from "../../middleware/orgRls";
import { assertSafeFetchUrl } from "../../shared/safeFetch";
import type { HonoEnv } from "../../shared/types";
import { deliverWebhook } from "./delivery";
import { webhookDeliveryLog } from "./deliveryLog";
import { getUserOrgIds, resolveOrgForWebhookCreate } from "./orgScope";
import { webhookStore } from "./store";
import type { WebhookEventType } from "./types";

const app = new Hono<HonoEnv>();

// Auth guard for all webhook admin routes
app.use("*", authMiddleware);
app.use("*", orgRlsMiddleware());

// GET / — list endpoints for the caller's org memberships only
app.get("/", async (c) => {
  const user = c.get("user");
  const orgIds = await getUserOrgIds(user.id);
  const endpoints = await webhookStore.listEndpointsForOrgs(orgIds, user.id);
  return c.json(endpoints);
});

// POST / — register endpoint (org derived from membership, never from tenantId)
app.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    url: string;
    secret: string;
    events: WebhookEventType[];
    orgId?: string;
    headers?: Record<string, string>;
    retryPolicy?: { maxRetries: number; backoffMs: number };
  }>();

  const { url, secret, events, orgId, headers, retryPolicy } = body;

  if (!url || !secret || !Array.isArray(events) || events.length === 0) {
    return c.json(
      {
        code: "INVALID_INPUT",
        message: "url, secret, and events[] are required",
        details: [],
      },
      400
    );
  }

  const orgResolution = await resolveOrgForWebhookCreate(user.id, orgId);
  if ("error" in orgResolution) {
    if (orgResolution.error === "NO_ORG") {
      return c.json(
        {
          code: "FORBIDDEN",
          message: "Join an organization before managing webhooks",
          details: [],
        },
        403
      );
    }
    if (orgResolution.error === "ORG_REQUIRED") {
      return c.json(
        {
          code: "ORG_REQUIRED",
          message: "orgId is required when you belong to multiple organizations",
          details: [],
        },
        400
      );
    }
    return c.json(
      {
        code: "FORBIDDEN",
        message: "Not a member of the requested organization",
        details: [],
      },
      403
    );
  }

  try {
    assertSafeFetchUrl(url);
  } catch {
    return c.json(
      {
        code: "INVALID_WEBHOOK_URL",
        message: "Webhook URL must be a public HTTP(S) URL with a safe host",
        details: [],
      },
      400
    );
  }

  const endpoint = await webhookStore.registerEndpoint(
    {
      url,
      secret,
      events,
      orgId: orgResolution.orgId,
      headers,
      active: true,
      retryPolicy: retryPolicy ?? { maxRetries: 3, backoffMs: 1000 },
    },
    user.id
  );

  return c.json(endpoint, 201);
});

// GET /:id — get endpoint (org-scoped)
app.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const orgIds = await getUserOrgIds(user.id);
  const endpoint = await webhookStore.getEndpoint(id, orgIds, user.id);

  if (!endpoint) {
    return c.json(
      {
        code: "NOT_FOUND",
        message: `Webhook endpoint ${id} not found`,
        details: [],
      },
      404
    );
  }

  return c.json(endpoint);
});

// PATCH /:id — update endpoint (org-scoped)
app.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const orgIds = await getUserOrgIds(user.id);
  const body = await c.req.json<Record<string, unknown>>();
  if (typeof body.url === "string") {
    try {
      assertSafeFetchUrl(body.url);
    } catch {
      return c.json(
        {
          code: "INVALID_WEBHOOK_URL",
          message: "Webhook URL must be a public HTTP(S) URL with a safe host",
          details: [],
        },
        400
      );
    }
  }
  // Never allow clients to reassign webhook ownership via tenantId/orgId.
  delete body.tenantId;
  delete body.orgId;

  const updated = await webhookStore.updateEndpoint(id, body, orgIds, user.id);

  if (!updated) {
    return c.json(
      {
        code: "NOT_FOUND",
        message: `Webhook endpoint ${id} not found`,
        details: [],
      },
      404
    );
  }

  return c.json(updated);
});

// DELETE /:id — delete endpoint (org-scoped)
app.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const orgIds = await getUserOrgIds(user.id);
  const deleted = await webhookStore.deleteEndpoint(id, orgIds, user.id);

  if (!deleted) {
    return c.json(
      {
        code: "NOT_FOUND",
        message: `Webhook endpoint ${id} not found`,
        details: [],
      },
      404
    );
  }

  webhookDeliveryLog.clear(id);
  return new Response(null, { status: 204 });
});

// GET /:id/deliveries — per-attempt delivery history (most recent first)
app.get("/:id/deliveries", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const orgIds = await getUserOrgIds(user.id);
  const endpoint = await webhookStore.getEndpoint(id, orgIds, user.id);
  if (!endpoint) {
    return c.json(
      {
        code: "NOT_FOUND",
        message: `Webhook endpoint ${id} not found`,
        details: [],
      },
      404
    );
  }

  const limitRaw = parseInt(c.req.query("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

  const deliveries = webhookDeliveryLog.list(id, limit).map((d) => ({
    id: d.id,
    event: d.event,
    status: d.status,
    attempt: d.attempt,
    responseStatus: d.responseStatus ?? null,
    error: d.error ?? null,
    deliveredAt: d.deliveredAt ?? null,
    recordedAt: d.recordedAt,
  }));

  return c.json({ deliveries });
});

// POST /:id/replay/:deliveryId — redeliver a past attempt's payload
app.post("/:id/replay/:deliveryId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const deliveryId = c.req.param("deliveryId");
  const orgIds = await getUserOrgIds(user.id);
  const endpoint = await webhookStore.getEndpoint(id, orgIds, user.id);

  if (!endpoint) {
    return c.json(
      {
        code: "NOT_FOUND",
        message: `Webhook endpoint ${id} not found`,
        details: [],
      },
      404
    );
  }

  const prior = webhookDeliveryLog.get(id, deliveryId);
  if (!prior) {
    return c.json(
      {
        code: "NOT_FOUND",
        message: `Delivery ${deliveryId} not found`,
        details: [],
      },
      404
    );
  }

  try {
    const delivery = await deliverWebhook(endpoint, prior.event, prior.payload, 1);
    return c.json(delivery);
  } catch (err) {
    return c.json(
      {
        code: "DELIVERY_ERROR",
        message: "Failed to replay webhook",
        details: [String(err)],
      },
      500
    );
  }
});

// POST /:id/rotate-secret — generate a new signing secret (shown once)
app.post("/:id/rotate-secret", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const orgIds = await getUserOrgIds(user.id);
  const endpoint = await webhookStore.getEndpoint(id, orgIds, user.id);

  if (!endpoint) {
    return c.json(
      {
        code: "NOT_FOUND",
        message: `Webhook endpoint ${id} not found`,
        details: [],
      },
      404
    );
  }

  const { randomBytes } = await import("node:crypto");
  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  const updated = await webhookStore.updateEndpoint(id, { secret }, orgIds, user.id);
  if (!updated) {
    return c.json(
      {
        code: "NOT_FOUND",
        message: `Webhook endpoint ${id} not found`,
        details: [],
      },
      404
    );
  }

  return c.json({ id, secret, rotatedAt: new Date().toISOString() });
});

// POST /:id/ping — send test ping (org-scoped)
app.post("/:id/ping", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const orgIds = await getUserOrgIds(user.id);
  const endpoint = await webhookStore.getEndpoint(id, orgIds, user.id);

  if (!endpoint) {
    return c.json(
      {
        code: "NOT_FOUND",
        message: `Webhook endpoint ${id} not found`,
        details: [],
      },
      404
    );
  }

  try {
    const delivery = await deliverWebhook(
      endpoint,
      "auth.login.success" as WebhookEventType,
      { test: true, message: "zerotrust webhook ping" },
      1
    );
    return c.json(delivery);
  } catch (err) {
    return c.json(
      {
        code: "DELIVERY_ERROR",
        message: "Failed to send test webhook",
        details: [String(err)],
      },
      500
    );
  }
});

export default app;
