import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock("../db", () => ({ getDb: () => mockDb }));
vi.mock("../middleware/auth", () => ({
  authMiddleware: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "user-uuid-1", email: "test@example.com" });
    await next();
  }),
}));
vi.mock("../middleware/rateLimiting", () => ({
  rateLimit: () => vi.fn(async (_c: any, next: any) => next()),
}));

import apiKeyRoutes from "../api/routes/api-keys.routes";

const app = new Hono();
app.route("/api-keys", apiKeyRoutes as any);

function chain(returnValue: any) {
  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then" || prop === Symbol.toPrimitive) return undefined;
        return () => proxy;
      },
    }
  );
  // make it awaitable by resolving to returnValue
  proxy[Symbol.iterator] = undefined;
  // override to return final value
  const real: any = {
    where: () => real,
    limit: () => Promise.resolve(returnValue),
    returning: () => Promise.resolve(returnValue),
    set: () => real,
    values: () => real,
  };
  return real;
}

describe("GET /api-keys", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns list of api keys", async () => {
    const keys = [
      {
        id: "k1",
        name: "My Key",
        keyPrefix: "zak_ABCD",
        scopes: [],
        orgId: null,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
      },
    ];
    mockDb.select.mockReturnValue({
      from: () => ({
        where: () => Promise.resolve(keys),
      }),
    });

    const res = await app.request("/api-keys", { method: "GET" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].name).toBe("My Key");
  });
});

describe("POST /api-keys", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new api key and returns it with plaintext key", async () => {
    const created = {
      id: "k2",
      userId: "user-uuid-1",
      name: "CI Key",
      keyPrefix: "zak_EFGH",
      keyHash: "hashhash",
      scopes: [],
      orgId: null,
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    };
    mockDb.insert.mockReturnValue({
      values: () => ({
        returning: () => Promise.resolve([created]),
      }),
    });

    const res = await app.request("/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "CI Key" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("CI Key");
    expect(typeof body.key).toBe("string");
    expect(body.key).toMatch(/^zak_/);
  });

  it("rejects missing name", async () => {
    const res = await app.request("/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_REQUEST");
  });
});

describe("DELETE /api-keys/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revokes an existing key", async () => {
    mockDb.select.mockReturnValue({
      from: () => ({
        where: () => Promise.resolve([{ id: "k1" }]),
      }),
    });
    mockDb.update.mockReturnValue({
      set: () => ({ where: () => Promise.resolve() }),
    });

    const res = await app.request("/api-keys/k1", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 404 for unknown key", async () => {
    mockDb.select.mockReturnValue({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    });

    const res = await app.request("/api-keys/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
