import { createHmac, randomUUID } from "node:crypto";
import { fetchPublicUrl } from "../shared/safeFetch";
import { webhookDeliveryLog } from "./deliveryLog";
import { webhookStore } from "./store";
import type { WebhookDelivery, WebhookEndpoint, WebhookEventType } from "./types";

export function signPayload(secret: string, body: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(body);
  return `sha256=${hmac.digest("hex")}`;
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
  attempt: number
): Promise<void> {
  const result = await deliverWebhook(endpoint, event, payload, attempt);

  if (result.status !== "delivered" && attempt < endpoint.retryPolicy.maxRetries) {
    const delay = endpoint.retryPolicy.backoffMs * 2 ** (attempt - 1);
    setTimeout(() => {
      retryDelivery(endpoint, event, payload, attempt + 1).catch(() => {
        // fire-and-forget — errors are swallowed
      });
    }, delay);
  }
}

export async function dispatchEvent(
  event: WebhookEventType,
  payload: Record<string, unknown>,
  tenantId?: string
): Promise<void> {
  const endpoints = webhookStore.getEndpointsForEvent(event, tenantId);

  await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      const delivery = await deliverWebhook(endpoint, event, payload, 1);

      if (delivery.status !== "delivered" && endpoint.retryPolicy.maxRetries > 0) {
        const delay = endpoint.retryPolicy.backoffMs;
        setTimeout(() => {
          retryDelivery(endpoint, event, payload, 2).catch(() => {
            // fire-and-forget
          });
        }, delay);
      }
    })
  );
}
