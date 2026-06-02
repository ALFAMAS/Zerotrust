import { Router } from "express";
import type { Request, Response } from "express";
import { webhookStore } from "./store";
import { deliverWebhook } from "./delivery";
import type { WebhookEventType } from "./types";

const router = Router();

// POST / — register endpoint
router.post("/", (req: Request, res: Response) => {
  const { url, secret, events, tenantId, headers, retryPolicy } = req.body as {
    url: string;
    secret: string;
    events: WebhookEventType[];
    tenantId?: string;
    headers?: Record<string, string>;
    retryPolicy?: { maxRetries: number; backoffMs: number };
  };

  if (!url || !secret || !Array.isArray(events) || events.length === 0) {
    res.status(400).json({
      code: "INVALID_INPUT",
      message: "url, secret, and events[] are required",
      details: [],
    });
    return;
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

  res.status(201).json(endpoint);
});

// GET / — list endpoints
router.get("/", (req: Request, res: Response) => {
  const tenantId = req.query["tenantId"] as string | undefined;
  const endpoints = webhookStore.listEndpoints(tenantId);
  res.json(endpoints);
});

// PUT /:id — update endpoint
router.put("/:id", (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const updated = webhookStore.updateEndpoint(id, req.body as Record<string, unknown>);

  if (!updated) {
    res.status(404).json({
      code: "NOT_FOUND",
      message: `Webhook endpoint ${id} not found`,
      details: [],
    });
    return;
  }

  res.json(updated);
});

// DELETE /:id — delete endpoint
router.delete("/:id", (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const deleted = webhookStore.deleteEndpoint(id);

  if (!deleted) {
    res.status(404).json({
      code: "NOT_FOUND",
      message: `Webhook endpoint ${id} not found`,
      details: [],
    });
    return;
  }

  res.status(204).send();
});

// POST /test/:id — send a test ping to the endpoint
router.post("/test/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const endpoints = webhookStore.listEndpoints();
  const endpoint = endpoints.find((ep) => ep.id === id);

  if (!endpoint) {
    res.status(404).json({
      code: "NOT_FOUND",
      message: `Webhook endpoint ${id} not found`,
      details: [],
    });
    return;
  }

  try {
    const delivery = await deliverWebhook(
      endpoint,
      "auth.login.success" as WebhookEventType,
      { test: true, message: "ZeroAuth webhook ping" },
      1
    );
    res.json(delivery);
  } catch (err) {
    res.status(500).json({
      code: "DELIVERY_ERROR",
      message: "Failed to send test webhook",
      details: [String(err)],
    });
  }
});

export default router;
