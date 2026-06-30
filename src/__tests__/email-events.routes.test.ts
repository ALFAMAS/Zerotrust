import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  claim: vi.fn(),
  release: vi.fn(),
  suppressEmail: vi.fn(),
}));

vi.mock("../db/repositories/processedWebhookEvents.repository", () => ({
  claimProcessedWebhookEvent: h.claim,
  releaseProcessedWebhookEvent: h.release,
}));

vi.mock("../services/emailSuppression.service", () => ({
  suppressEmail: h.suppressEmail,
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import emailEventRoutes from "../api/routes/email-events.routes";

function app() {
  return new Hono().route("/webhooks/email", emailEventRoutes);
}

function postEmailEvent(body: unknown, headers: Record<string, string> = {}) {
  return app().request("/webhooks/email/event", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /webhooks/email/event - idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EMAIL_WEBHOOK_SECRET;
    h.claim.mockResolvedValue(true);
    h.release.mockResolvedValue(undefined);
    h.suppressEmail.mockResolvedValue(undefined);
  });

  it("claims a provider event id before suppressing the recipient", async () => {
    const res = await postEmailEvent({
      eventId: "esp_evt_1",
      email: "Bounce@Test.com",
      type: "bounce",
      detail: "550 5.1.1",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suppressed: true });
    expect(h.claim).toHaveBeenCalledWith({
      consumer: "email",
      eventKey: "esp_evt_1",
      eventType: "bounce",
    });
    expect(h.suppressEmail).toHaveBeenCalledWith("Bounce@Test.com", "bounce", "550 5.1.1");
  });

  it("skips a duplicate provider event without re-suppressing", async () => {
    h.claim.mockResolvedValue(false);

    const res = await postEmailEvent({
      eventId: "esp_evt_duplicate",
      email: "dupe@test.com",
      type: "complaint",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suppressed: true, duplicate: true });
    expect(h.suppressEmail).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });

  it("falls back to a content hash when the provider has no event id", async () => {
    const res = await postEmailEvent({
      email: "hash@test.com",
      type: "bounce",
      detail: "mailbox unavailable",
    });

    expect(res.status).toBe(200);
    expect(h.claim).toHaveBeenCalledWith({
      consumer: "email",
      eventKey: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      eventType: "bounce",
    });
  });

  it("releases the idempotency claim when suppression processing fails", async () => {
    h.suppressEmail.mockRejectedValueOnce(new Error("db down"));

    const res = await postEmailEvent({
      eventId: "esp_evt_retry",
      email: "retry@test.com",
      type: "bounce",
    });

    expect(res.status).toBe(500);
    expect(h.release).toHaveBeenCalledWith({
      consumer: "email",
      eventKey: "esp_evt_retry",
    });
  });
});
