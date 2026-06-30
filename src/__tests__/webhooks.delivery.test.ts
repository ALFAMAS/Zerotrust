import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetchPublicUrl: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../shared/safeFetch", () => ({
  fetchPublicUrl: h.fetchPublicUrl,
}));

vi.mock("../db/repositories/processedWebhookEvents.repository", () => ({
  claimProcessedWebhookEvent: h.claim,
  releaseProcessedWebhookEvent: h.release,
}));

import { dispatchEvent } from "../webhooks/delivery";
import { webhookStore } from "../webhooks/store";
import type { WebhookEndpoint, WebhookEventType } from "../webhooks/types";

const endpoints: WebhookEndpoint[] = [];

function registerEndpoint(events: WebhookEventType[] = ["user.created"]) {
  const endpoint = webhookStore.registerEndpoint({
    url: "https://hooks.example.test/zerotrust",
    secret: "webhook-secret",
    events,
    active: true,
    retryPolicy: { maxRetries: 0, backoffMs: 1000 },
  });
  endpoints.push(endpoint);
  return endpoint;
}

describe("dispatchEvent - webhook delivery idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.claim.mockResolvedValue(true);
    h.release.mockResolvedValue(undefined);
    h.fetchPublicUrl.mockResolvedValue(new Response("ok", { status: 200 }));
  });

  afterEach(() => {
    while (endpoints.length > 0) {
      const endpoint = endpoints.pop();
      if (endpoint) webhookStore.deleteEndpoint(endpoint.id);
    }
  });

  it("claims an event id for each subscribed endpoint before delivery", async () => {
    const endpoint = registerEndpoint();

    await dispatchEvent("user.created", { eventId: "evt_user_created_1", userId: "user-1" });

    expect(h.claim).toHaveBeenCalledWith({
      consumer: `webhook:${endpoint.id}`,
      eventKey: "evt_user_created_1",
      eventType: "user.created",
    });
    expect(h.fetchPublicUrl).toHaveBeenCalledTimes(1);
  });

  it("skips duplicate deliveries without posting to the endpoint again", async () => {
    registerEndpoint();
    h.claim.mockResolvedValue(false);

    await dispatchEvent("user.created", { eventId: "evt_duplicate", userId: "user-1" });

    expect(h.fetchPublicUrl).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });

  it("falls back to a content hash when the payload has no event id", async () => {
    registerEndpoint(["user.updated"]);

    await dispatchEvent("user.updated", { userId: "user-1", changed: ["name"] });

    expect(h.claim).toHaveBeenCalledWith({
      consumer: expect.stringMatching(/^webhook:/),
      eventKey: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      eventType: "user.updated",
    });
  });

  it("releases the claim when first delivery fails", async () => {
    const endpoint = registerEndpoint();
    h.fetchPublicUrl.mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));

    await dispatchEvent("user.created", { eventId: "evt_retry", userId: "user-1" });

    expect(h.release).toHaveBeenCalledWith({
      consumer: `webhook:${endpoint.id}`,
      eventKey: "evt_retry",
    });
  });
});
