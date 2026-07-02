import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock("../db", () => ({ getDb: () => mockDb, getReadDb: () => mockDb }));
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
        rateLimitPerMinute: 120,
        monthlyQuota: 1000,
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
      rateLimitPerMinute: null,
      monthlyQuota: null,
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

  it("persists per-key rate limit and monthly quota settings", async () => {
    const captured: any[] = [];
    mockDb.insert.mockReturnValue({
      values: (value: any) => {
        captured.push(value);
        return {
          returning: () =>
            Promise.resolve([
              {
                id: "k3",
                userId: "user-uuid-1",
                name: "Metered Key",
                keyPrefix: "zak_IJKL",
                keyHash: "hashhash",
                scopes: [],
                orgId: null,
                rateLimitPerMinute: value.rateLimitPerMinute,
                monthlyQuota: value.monthlyQuota,
                expiresAt: null,
                lastUsedAt: null,
                revokedAt: null,
                createdAt: new Date(),
              },
            ]),
        };
      },
    });

    const res = await app.request("/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Metered Key",
        rateLimitPerMinute: 60,
        monthlyQuota: 10_000,
      }),
    });
    expect(res.status).toBe(201);
    expect(captured[0].rateLimitPerMinute).toBe(60);
    expect(captured[0].monthlyQuota).toBe(10_000);
  });

  it("defaults to a live key when no environment is given", async () => {
    const captured: any[] = [];
    mockDb.insert.mockReturnValue({
      values: (value: any) => {
        captured.push(value);
        return { returning: () => Promise.resolve([{ id: "k4", ...value, createdAt: new Date() }]) };
      },
    });

    const res = await app.request("/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Default Key" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(captured[0].environment).toBe("live");
    expect(body.key).toMatch(/^zak_live_/);
  });

  it("creates a test-mode key with a zak_test_ prefix", async () => {
    const captured: any[] = [];
    mockDb.insert.mockReturnValue({
      values: (value: any) => {
        captured.push(value);
        return { returning: () => Promise.resolve([{ id: "k5", ...value, createdAt: new Date() }]) };
      },
    });

    const res = await app.request("/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sandbox Key", environment: "test" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(captured[0].environment).toBe("test");
    expect(body.key).toMatch(/^zak_test_/);
    expect(captured[0].keyPrefix.startsWith("zak_test_")).toBe(true);
  });

  it("rejects an invalid environment value", async () => {
    const res = await app.request("/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bad", environment: "staging" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_REQUEST");
  });

  it("requires org admin role before creating org-scoped keys", async () => {
    mockDb.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ role: "member" }]),
        }),
      }),
    });

    const res = await app.request("/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Org Key",
        orgId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    expect(res.status).toBe(403);
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
