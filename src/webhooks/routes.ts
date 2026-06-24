import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import type { HonoEnv } from "../shared/types";
import { deliverWebhook } from "./delivery";
import { webhookDeliveryLog } from "./deliveryLog";
import { webhookStore } from "./store";
import type { WebhookEventType } from "./types";

const app = new Hono<HonoEnv>();

// Auth guard for all webhook admin routes
app.use("*", authMiddleware);

// GET / — list endpoints
app.get("/", (c) => {
  const tenantId = c.req.query("tenantId");
  const endpoints = webhookStore.listEndpoints(tenantId);
  return c.json(endpoints);
});

// POST / — register endpoint
app.post("/", async (c) => {
  const body = await c.req.json<{
    url: string;
    secret: string;
    events: WebhookEventType[];
    tenantId?: string;
    headers?: Record<string, string>;
    retryPolicy?: { maxRetries: number; backoffMs: number };
  }>();

  const { url, secret, events, tenantId, headers, retryPolicy } = body;

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

  const endpoint = webhookStore.registerEndpoint({
    url,
    secret,
    events,
    tenantId,
    headers,
    active: true,
    retryPolicy: retryPolicy ?? { maxRetries: 3, backoffMs: 1000 },
  });

  return c.json(endpoint, 201);
});

// GET /:id — get endpoint
app.get("/:id", (c) => {
  const id = c.req.param("id");
  const endpoints = webhookStore.listEndpoints();
  const endpoint = endpoints.find((ep) => ep.id === id);

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

// PATCH /:id — update endpoint
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<Record<string, unknown>>();
  const updated = webhookStore.updateEndpoint(id, body);

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

// DELETE /:id — delete endpoint
app.delete("/:id", (c) => {
  const id = c.req.param("id");
  const deleted = webhookStore.deleteEndpoint(id);

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
app.get("/:id/deliveries", (c) => {
  const id = c.req.param("id");
  const endpoint = webhookStore.listEndpoints().find((ep) => ep.id === id);
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

// POST /:id/ping — send test ping
app.post("/:id/ping", async (c) => {
  const id = c.req.param("id");
  const endpoints = webhookStore.listEndpoints();
  const endpoint = endpoints.find((ep) => ep.id === id);

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
