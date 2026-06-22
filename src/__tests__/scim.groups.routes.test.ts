import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { getDb } from "../db";
import scimRoutes from "../scim/routes";
import { groupToSCIM } from "../scim/utils";

// Minimal Drizzle-shaped chain whose terminal calls resolve to `returnValue`.
function makeChain(returnValue: any = []) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  return chain;
}

const app = new Hono();
app.route("/scim/v2", scimRoutes as any);

function jsonReq(path: string, method: string, body: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("groupToSCIM serializer", () => {
  it("maps a role + member users to a SCIM 2.0 Group", () => {
    const role = {
      id: "r1",
      name: "Engineering",
      displayName: "Engineering Team",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    };
    const members = [{ id: "u1", displayName: "Ada", email: "ada@example.com" }];
    const g = groupToSCIM(role, members, "http://localhost");
    expect(g.id).toBe("r1");
    expect(g.displayName).toBe("Engineering Team");
    expect(g.members).toEqual([{ value: "u1", display: "Ada" }]);
    expect(g.meta?.resourceType).toBe("Group");
    expect(g.meta?.location).toBe("http://localhost/scim/v2/Groups/r1");
    expect(g.schemas).toContain("urn:ietf:params:scim:schemas:core:2.0:Group");
  });

  it("falls back to email when a member has no displayName", () => {
    const g = groupToSCIM({ id: "r1", name: "x", displayName: "X" }, [{ id: "u2", email: "b@x.com" }], "http://h");
    expect(g.members?.[0]).toEqual({ value: "u2", display: "b@x.com" });
  });
});

describe("SCIM Group routes", () => {
  beforeEach(() => {
    // Ensure dev-mode (open) bearer auth: no legacy token configured.
    delete process.env.SCIM_API_TOKEN;
  });
  afterEach(() => vi.clearAllMocks());

  it("POST /Groups → 400 when displayName is missing", async () => {
    const res = await jsonReq("/scim/v2/Groups", "POST", {});
    expect(res.status).toBe(400);
    expect((await res.json()).scimType).toBe("invalidValue");
  });

  it("PATCH /Groups/:id → 400 when Operations is not an array", async () => {
    const res = await jsonReq("/scim/v2/Groups/r1", "PATCH", {});
    expect(res.status).toBe(400);
  });

  it("GET /Groups/:id → 404 for an unknown group", async () => {
    (getDb as any).mockReturnValue(makeChain([]));
    const res = await app.request("/scim/v2/Groups/unknown");
    expect(res.status).toBe(404);
  });

  it("DELETE /Groups/:id → 404 for an unknown group", async () => {
    (getDb as any).mockReturnValue(makeChain([]));
    const res = await app.request("/scim/v2/Groups/unknown", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("POST /Groups → 409 when the group already exists", async () => {
    (getDb as any).mockReturnValue(makeChain([{ id: "r1", name: "Eng", displayName: "Eng" }]));
    const res = await jsonReq("/scim/v2/Groups", "POST", { displayName: "Eng" });
    expect(res.status).toBe(409);
    expect((await res.json()).scimType).toBe("uniqueness");
  });
});
