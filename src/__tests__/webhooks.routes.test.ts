import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "00000000-0000-4000-8000-0000000000a1";
const ORG_B = "00000000-0000-4000-8000-0000000000b2";
const USER_A = "00000000-0000-4000-8000-0000000000u1";
const USER_B = "00000000-0000-4000-8000-0000000000u2";
const EP_A = "00000000-0000-4000-8000-0000000000e1";
const EP_B = "00000000-0000-4000-8000-0000000000e2";

const h = vi.hoisted(() => ({
  endpoints: [] as Array<{
    id: string;
    url: string;
    secret: string;
    events: string[];
    tenantId: string;
    active: boolean;
    createdAt: Date;
    retryPolicy: { maxRetries: number; backoffMs: number };
  }>,
  orgIdsByUser: new Map<string, string[]>(),
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    const uid = c.req.header("x-test-user-id");
    if (!uid) return c.json({ error: "TOKEN_INVALID" }, 401);
    c.set("user", { id: uid, email: `${uid}@example.com`, roles: ["user"] });
    return next();
  },
}));

vi.mock("../modules/webhooks/orgScope", () => ({
  getUserOrgIds: vi.fn(async (userId: string) => h.orgIdsByUser.get(userId) ?? []),
  resolveOrgForWebhookCreate: vi.fn(async (userId: string, requestedOrgId?: string) => {
    const orgIds = h.orgIdsByUser.get(userId) ?? [];
    if (orgIds.length === 0) return { error: "NO_ORG" as const };
    if (requestedOrgId) {
      return orgIds.includes(requestedOrgId)
        ? { orgId: requestedOrgId }
        : { error: "FORBIDDEN" as const };
    }
    if (orgIds.length === 1) return { orgId: orgIds[0]! };
    return { error: "ORG_REQUIRED" as const };
  }),
}));

vi.mock("../modules/webhooks/store", () => ({
  webhookStore: {
    listEndpointsForOrgs: vi.fn(async (orgIds: string[]) =>
      h.endpoints.filter((ep) => orgIds.includes(ep.tenantId))
    ),
    registerEndpoint: vi.fn(async (input: any) => {
      const endpoint = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        ...input,
      };
      h.endpoints.push(endpoint);
      return endpoint;
    }),
    getEndpoint: vi.fn(async (id: string, orgIds?: string[]) => {
      const ep = h.endpoints.find((row) => row.id === id);
      if (!ep) return null;
      if (orgIds && orgIds.length > 0 && !orgIds.includes(ep.tenantId)) return null;
      return ep;
    }),
    updateEndpoint: vi.fn(async (id: string, partial: any, orgIds?: string[]) => {
      const idx = h.endpoints.findIndex((ep) => ep.id === id);
      if (idx === -1) return null;
      if (orgIds && orgIds.length > 0 && !orgIds.includes(h.endpoints[idx]!.tenantId)) return null;
      h.endpoints[idx] = { ...h.endpoints[idx]!, ...partial };
      return h.endpoints[idx];
    }),
    deleteEndpoint: vi.fn(async (id: string, orgIds?: string[]) => {
      const idx = h.endpoints.findIndex((ep) => ep.id === id);
      if (idx === -1) return false;
      if (orgIds && orgIds.length > 0 && !orgIds.includes(h.endpoints[idx]!.orgId)) return false;
      h.endpoints.splice(idx, 1);
      return true;
    }),
  },
}));

import webhookRouter from "../modules/webhooks/routes";

function app() {
  return new Hono().route("/webhooks", webhookRouter);
}

function authHeaders(userId: string) {
  return { "x-test-user-id": userId };
}

describe("Webhook management org isolation (ZT-1)", () => {
  beforeEach(() => {
    h.endpoints.length = 0;
    h.orgIdsByUser.clear();
    h.orgIdsByUser.set(USER_A, [ORG_A]);
    h.orgIdsByUser.set(USER_B, [ORG_B]);
    h.endpoints.push(
      {
        id: EP_A,
        url: "https://hooks-a.example.test/zerotrust",
        secret: "whsec_org_a",
        events: ["user.created"],
        tenantId: ORG_A,
        active: true,
        createdAt: new Date(),
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
      },
      {
        id: EP_B,
        url: "https://hooks-b.example.test/zerotrust",
        secret: "whsec_org_b",
        events: ["user.created"],
        tenantId: ORG_B,
        active: true,
        createdAt: new Date(),
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
      }
    );
  });

  it("lists only endpoints for the caller's org memberships", async () => {
    const res = await app().request("/webhooks", { headers: authHeaders(USER_A) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(EP_A);
    expect(body[0].secret).toBe("whsec_org_a");
  });

  it("ignores request-supplied tenantId on list", async () => {
    const res = await app().request(`/webhooks?tenantId=${ORG_B}`, {
      headers: authHeaders(USER_A),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(EP_A);
  });

  it("returns 404 when org B user reads org A endpoint by id", async () => {
    const res = await app().request(`/webhooks/${EP_A}`, { headers: authHeaders(USER_B) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when org B user patches org A endpoint", async () => {
    const res = await app().request(`/webhooks/${EP_A}`, {
      method: "PATCH",
      headers: { ...authHeaders(USER_B), "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when org B user deletes org A endpoint", async () => {
    const res = await app().request(`/webhooks/${EP_A}`, {
      method: "DELETE",
      headers: authHeaders(USER_B),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when org B user pings org A endpoint", async () => {
    const res = await app().request(`/webhooks/${EP_A}/ping`, {
      method: "POST",
      headers: authHeaders(USER_B),
    });
    expect(res.status).toBe(404);
  });

  it("assigns orgId server-side on create (never from tenantId body field)", async () => {
    const res = await app().request("/webhooks", {
      method: "POST",
      headers: { ...authHeaders(USER_A), "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://hooks-new.example.test/zerotrust",
        secret: "whsec_new",
        events: ["user.created"],
        tenantId: ORG_B,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.orgId).toBe(ORG_A);
  });
});
