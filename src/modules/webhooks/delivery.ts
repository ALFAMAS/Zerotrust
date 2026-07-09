import { createHmac, randomUUID } from "node:crypto";
import {
  claimProcessedWebhookEvent,
  type ProcessedWebhookEventKey,
  releaseProcessedWebhookEvent,
} from "../../db/repositories/processedWebhookEvents.repository";
import { sha256Hex } from "../../shared/cryptoHash";
import { fetchPublicUrl } from "../../shared/safeFetch";
import { webhookDeliveryLog } from "./deliveryLog";
import { webhookStore } from "./store";
import type { WebhookDelivery, WebhookEndpoint, WebhookEventType } from "./types";

export function signPayload(secret: string, body: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(body);
  return `sha256=${hmac.digest("hex")}`;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function webhookEventKey(event: WebhookEventType, payload: Record<string, unknown>): string {
  const explicitId =
    stringValue(payload.eventId) ??
    stringValue(payload.webhookEventId) ??
    stringValue(payload.idempotencyKey);
  if (explicitId) return explicitId;

  return `sha256:${sha256Hex(JSON.stringify({ event, payload }))}`;
}

function webhookIdempotencyKey(
  endpoint: WebhookEndpoint,
  event: WebhookEventType,
  payload: Record<string, unknown>
): ProcessedWebhookEventKey {
  return {
    consumer: `webhook:${endpoint.id}`,
    eventKey: webhookEventKey(event, payload),
  };
}

async function releaseWebhookClaim(key: ProcessedWebhookEventKey): Promise<void> {
  await releaseProcessedWebhookEvent(key);
}

export async function deliverWebhook(
  endpoint: WebhookEndpoint,
  event: WebhookEventType,
  payload: Record<string, unknown>,
  attempt = 1
): Promise<WebhookDelivery> {
  const deliveryId = randomUUID();
  const messageId = randomUUID();

  const body = JSON.stringify({
    id: messageId,
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const signature = signPayload(endpoint.secret, body);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-zerotrust-Event": event,
    "X-zerotrust-Signature": signature,
    "X-zerotrust-Delivery": deliveryId,
    ...(endpoint.headers ?? {}),
  };

  const base: Omit<
    WebhookDelivery,
    "status" | "responseStatus" | "responseBody" | "error" | "deliveredAt" | "nextRetryAt"
  > = {
    id: deliveryId,
    endpointId: endpoint.id,
    event,
    payload,
    attempt,
  };

  try {
    // SECURITY (CWE-918): webhook endpoints are tenant/admin-configured and
    // therefore user-influenced server-side fetch targets.
    const response = await fetchPublicUrl(endpoint.url, {
      method: "POST",
      headers,
      body,
      timeoutMs: 30_000,
    });

    const responseBody = await response.text().catch(() => "");
    const success = response.status >= 200 && response.status < 300;

    const delivery: WebhookDelivery = {
      ...base,
      status: success ? "delivered" : "failed",
      responseStatus: response.status,
      // Cap stored response bodies so a chatty endpoint can't bloat the log.
      responseBody: responseBody.slice(0, 2000),
      ...(success ? { deliveredAt: new Date() } : {}),
    };

    webhookDeliveryLog.record(delivery);
    return delivery;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const delivery: WebhookDelivery = {
      ...base,
      status: "failed",
      error: errorMessage,
    };
    webhookDeliveryLog.record(delivery);
    return delivery;
  }
}

async function retryDelivery(
  endpoint: WebhookEndpoint,
  event: WebhookEventType,
  payload: Record<string, unknown>,
  attempt: number,
  idempotencyKey?: ProcessedWebhookEventKey
): Promise<void> {
  const result = await deliverWebhook(endpoint, event, payload, attempt);

  if (result.status !== "delivered" && attempt < endpoint.retryPolicy.maxRetries) {
    const delay = endpoint.retryPolicy.backoffMs * 2 ** (attempt - 1);
    setTimeout(() => {
      retryDelivery(endpoint, event, payload, attempt + 1, idempotencyKey).catch(() => {
        // fire-and-forget — errors are swallowed
      });
    }, delay);
  } else if (result.status !== "delivered" && idempotencyKey) {
    await releaseWebhookClaim(idempotencyKey);
  }
}

export async function dispatchEvent(
  event: WebhookEventType,
  payload: Record<string, unknown>,
  orgId?: string
): Promise<void> {
  const endpoints = await webhookStore.getEndpointsForEvent(event, orgId);

  await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      const idempotencyKey = webhookIdempotencyKey(endpoint, event, payload);
      const claimed = await claimProcessedWebhookEvent({
        ...idempotencyKey,
        eventType: event,
      });
      if (!claimed) return;

      let delivery: WebhookDelivery;
      try {
        delivery = await deliverWebhook(endpoint, event, payload, 1);
      } catch (err) {
        await releaseWebhookClaim(idempotencyKey);
        throw err;
      }

      if (delivery.status !== "delivered" && endpoint.retryPolicy.maxRetries > 0) {
        const delay = endpoint.retryPolicy.backoffMs;
        setTimeout(() => {
          retryDelivery(endpoint, event, payload, 2, idempotencyKey).catch(() => {
            // fire-and-forget
          });
        }, delay);
      } else if (delivery.status !== "delivered") {
        await releaseWebhookClaim(idempotencyKey);
      }
    })
  );
}
