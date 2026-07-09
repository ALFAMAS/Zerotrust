import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

// Stub auth: authenticate via `x-test-user-id`; roles via `x-test-roles`
// (comma-separated). Omitting the user header simulates an unauthenticated call.
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    const uid = c.req.header("x-test-user-id");
    if (!uid) return c.json({ error: "UNAUTHENTICATED" }, 401);
    const roles = (c.req.header("x-test-roles") ?? "").split(",").filter(Boolean);
    c.set("user", { id: uid, roles });
    return next();
  },
}));

const ORG_A = "00000000-0000-0000-0000-000000000001";
const ORG_B = "00000000-0000-0000-0000-000000000002";

vi.mock("../db", () => ({
  getReadDb: () => ({
    select: () => ({
      from: () => ({
        where: () => {
          const membershipRows = [{ orgId: ORG_A, role: "member" }];
          return {
            limit: async () => [{ role: "member" }],
            then(resolve: (v: typeof membershipRows) => void) {
              resolve(membershipRows);
            },
          };
        },
      }),
    }),
  }),
}));

// The store is DB-backed in production; these tests exercise the route layer
// (validation, role guards, state transitions, status codes), so we back it with
// a faithful in-memory fake — no database required.
vi.mock("../modules/jit/cross-tenant", () => {
  const store = new Map<string, any>();
  let seq = 0;
  return {
    requestCrossTenantAccess: async (
      requestorId: string,
      requestorOrgId: string,
      targetOrgId: string,
      targetResource: string,
      justification: string,
      ttlSeconds: number
    ) => {
      const id = `jit-${++seq}`;
      const rec = {
        id,
        requestorUserId: requestorId,
        requestorOrgId,
        targetOrgId,
        targetResource,
        justification,
        status: "pending",
        ttlSeconds,
        createdAt: new Date().toISOString(),
      };
      store.set(id, rec);
      return rec;
    },
    crossTenantJITStore: {
      listByRequestor: async (userId: string, orgId: string) =>
        [...store.values()].filter((r) => r.requestorUserId === userId && r.requestorOrgId === orgId),
      listByTarget: async (orgId: string) =>
        [...store.values()].filter((r) => r.targetOrgId === orgId),
      get: async (id: string) => store.get(id) ?? null,
      approve: async (id: string, approverId: string) => {
        const r = store.get(id);
        if (!r || r.status !== "pending") return null;
        r.status = "approved";
        r.approvedBy = approverId;
        r.expiresAt = new Date(Date.now() + r.ttlSeconds * 1000).toISOString();
        return r;
      },
      deny: async (id: string, approverId: string) => {
        const r = store.get(id);
        if (!r || r.status !== "pending") return null;
        r.status = "denied";
        r.deniedBy = approverId;
        return r;
      },
    },
  };
});

import jitRoutes from "../modules/jit/routes";

const REQUESTOR = "11111111-1111-1111-1111-111111111111";
const ADMIN = "22222222-2222-2222-2222-222222222222";

function app() {
  return new Hono().route("/", jitRoutes);
}

function req(
  path: string,
  opts: { method?: string; body?: unknown; userId?: string; roles?: string } = {}
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.userId) headers["x-test-user-id"] = opts.userId;
  if (opts.roles) headers["x-test-roles"] = opts.roles;
  return app().request(path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

const validBody = {
  targetOrgId: ORG_B,
  requestorOrgId: ORG_A,
  targetResource: "admin:users:read",
  justification: "Investigating a support ticket",
};

describe("Cross-tenant JIT routes", () => {
  it("rejects unauthenticated callers", async () => {
    const res = await req("/", { method: "POST", body: validBody });
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await req("/", { method: "POST", body: { targetOrgId: "x" }, userId: REQUESTOR });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_REQUEST");
  });

  it("creates a pending request and lists it for the requestor", async () => {
    const createRes = await req("/", { method: "POST", body: validBody, userId: REQUESTOR });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.status).toBe("pending");
    expect(created.id).toBeTruthy();

    const listRes = await req(`/?orgId=${ORG_A}`, { userId: REQUESTOR });
    expect(listRes.status).toBe(200);
    const mine = await listRes.json();
    expect(mine.some((r: any) => r.id === created.id)).toBe(true);
  });

  it("caps the TTL at one hour", async () => {
    const res = await req("/", {
      method: "POST",
      body: { ...validBody, ttlSeconds: 99999 },
      userId: REQUESTOR,
    });
    const created = await res.json();
    expect(created.ttlSeconds).toBe(3600);
  });

  it("hides the incoming inbox from non-admins", async () => {
    const res = await req(`/incoming?orgId=${ORG_B}`, { userId: REQUESTOR, roles: "user" });
    expect(res.status).toBe(403);
  });

  it("lets an admin view the incoming inbox", async () => {
    const res = await req(`/incoming?orgId=${ORG_B}`, { userId: ADMIN, roles: "admin" });
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("forbids non-admins from approving", async () => {
    const createRes = await req("/", { method: "POST", body: validBody, userId: REQUESTOR });
    const { id } = await createRes.json();
    const res = await req(`/${id}/approve`, { method: "POST", userId: REQUESTOR, roles: "user" });
    expect(res.status).toBe(403);
  });

  it("lets an admin approve, then rejects a follow-up deny (state guard)", async () => {
    const createRes = await req("/", { method: "POST", body: validBody, userId: REQUESTOR });
    const { id } = await createRes.json();

    const approveRes = await req(`/${id}/approve`, { method: "POST", userId: ADMIN, roles: "admin" });
    expect(approveRes.status).toBe(200);
    const approved = await approveRes.json();
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe(ADMIN);
    expect(approved.expiresAt).toBeTruthy();

    const denyRes = await req(`/${id}/deny`, { method: "POST", userId: ADMIN, roles: "admin" });
    expect(denyRes.status).toBe(409);
  });

  it("returns 404 approving a non-existent request", async () => {
    const res = await req("/missing-id/approve", { method: "POST", userId: ADMIN, roles: "admin" });
    expect(res.status).toBe(404);
  });

  it("exposes request status by id", async () => {
    const createRes = await req("/", { method: "POST", body: validBody, userId: REQUESTOR });
    const { id } = await createRes.json();
    const res = await req(`/status/${id}`, { userId: REQUESTOR });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(id);
  });
});
