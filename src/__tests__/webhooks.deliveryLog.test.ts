import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const h = vi.hoisted(() => ({
  endpoints: [] as any[],
  nextId: 1,
}));

// Stub auth so the webhook admin routes are reachable without a real token.
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: "user-1", email: "admin@example.com", roles: ["admin"] });
    return next();
  },
}));

vi.mock("../modules/webhooks/orgScope", () => ({
  getUserOrgIds: vi.fn(async () => ["org-test"]),
  resolveOrgForWebhookCreate: vi.fn(),
}));

vi.mock("../modules/webhooks/store", () => ({
  webhookStore: {
    registerEndpoint: vi.fn(async (input: any) => {
      const endpoint = { id: `ep-${h.nextId++}`, createdAt: new Date(), ...input };
      h.endpoints.push(endpoint);
      return endpoint;
    }),
    getEndpoint: vi.fn(async (id: string, orgIds?: string[]) => {
      const ep = h.endpoints.find((e) => e.id === id) ?? null;
      if (!ep) return null;
      const ownerOrg = ep.orgId ?? ep.tenantId;
      if (orgIds && orgIds.length > 0 && ownerOrg && !orgIds.includes(ownerOrg)) return null;
      return ep;
    }),
    deleteEndpoint: vi.fn(async (id: string, orgIds?: string[]) => {
      const idx = h.endpoints.findIndex((ep) => ep.id === id);
      if (idx === -1) return false;
      const ownerOrg = h.endpoints[idx]!.orgId ?? h.endpoints[idx]!.tenantId;
      if (orgIds && orgIds.length > 0 && ownerOrg && !orgIds.includes(ownerOrg)) return false;
      h.endpoints.splice(idx, 1);
      return true;
    }),
  },
}));

import { WebhookDeliveryLog, webhookDeliveryLog } from "../modules/webhooks/deliveryLog";
import { webhookStore } from "../modules/webhooks/store";
import webhookRouter from "../modules/webhooks/routes";
import type { WebhookDelivery } from "../modules/webhooks/types";

function makeDelivery(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
  return {
    id: crypto.randomUUID(),
    endpointId: "ep-1",
    event: "user.created",
    payload: {},
    attempt: 1,
    status: "delivered",
    responseStatus: 200,
    ...overrides,
  };
}

describe("WebhookDeliveryLog", () => {
  it("records attempts most-recent-first per endpoint", () => {
    const log = new WebhookDeliveryLog();
    log.record(makeDelivery({ attempt: 1, status: "failed", responseStatus: 500 }));
    log.record(makeDelivery({ attempt: 2, status: "delivered", responseStatus: 200 }));

    const entries = log.list("ep-1");
    expect(entries).toHaveLength(2);
    expect(entries[0].attempt).toBe(2); // newest first
    expect(entries[0].status).toBe("delivered");
    expect(entries[0].recordedAt).toBeInstanceOf(Date);
  });

  it("isolates history per endpoint", () => {
    const log = new WebhookDeliveryLog();
    log.record(makeDelivery({ endpointId: "ep-1" }));
    log.record(makeDelivery({ endpointId: "ep-2" }));
    expect(log.list("ep-1")).toHaveLength(1);
    expect(log.list("ep-2")).toHaveLength(1);
  });

  it("caps history per endpoint (ring buffer)", () => {
    const log = new WebhookDeliveryLog(3);
    for (let i = 0; i < 10; i++) log.record(makeDelivery({ attempt: i }));
    const entries = log.list("ep-1", 100);
    expect(entries).toHaveLength(3);
    // Most recent (attempt 9) retained, oldest dropped.
    expect(entries[0].attempt).toBe(9);
    expect(entries.some((e) => e.attempt === 0)).toBe(false);
  });

  it("clears a deleted endpoint's history", () => {
    const log = new WebhookDeliveryLog();
    log.record(makeDelivery({ endpointId: "ep-1" }));
    log.clear("ep-1");
    expect(log.list("ep-1")).toHaveLength(0);
  });
});

describe("GET /webhooks/:id/deliveries", () => {
  beforeEach(() => {
    webhookDeliveryLog.reset();
    h.endpoints.length = 0;
    h.nextId = 1;
  });

  function getApp() {
    return new Hono().route("/webhooks", webhookRouter);
  }

  it("returns 404 for an unknown endpoint", async () => {
    const app = getApp();
    const res = await app.request("/webhooks/missing/deliveries");
    expect(res.status).toBe(404);
  });

  it("returns recorded deliveries for a registered endpoint", async () => {
    const ep = await webhookStore.registerEndpoint({
      url: "https://example.test/hook",
      secret: "s3cret",
      events: ["user.created"],
      orgId: "org-test",
      active: true,
      retryPolicy: { maxRetries: 0, backoffMs: 1000 },
    });
    webhookDeliveryLog.record({
      id: crypto.randomUUID(),
      endpointId: ep.id,
      event: "user.created",
      payload: {},
      attempt: 1,
      status: "failed",
      responseStatus: 503,
      error: "Service Unavailable",
    });

    const app = getApp();
    const res = await app.request(`/webhooks/${ep.id}/deliveries`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deliveries).toHaveLength(1);
    expect(body.deliveries[0].status).toBe("failed");
    expect(body.deliveries[0].responseStatus).toBe(503);
    // The signing secret must never leak into the delivery log response.
    expect(JSON.stringify(body)).not.toContain("s3cret");

    await webhookStore.deleteEndpoint(ep.id, ["org-test"]);
  });
});
