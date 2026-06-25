import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

// auth.ts pulls config/db in transitively; stub the heavy bits so the module
// loads without a real database/config. `requireAdmin` itself only reads the
// user set on the context by `authMiddleware`, so no DB is exercised here.
vi.mock("../config", () => ({
  getConfig: () => ({
    security: { tokenSecretHex: "a".repeat(64) },
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
  }),
}));
vi.mock("../db", () => ({ getDb: vi.fn() }));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

async function appWith(user: unknown) {
  const { requireAdmin } = await import("../middleware/auth");
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (user) c.set("user", user as any);
    return next();
  });
  app.use("*", requireAdmin);
  app.get("/x", (c) => c.json({ ok: true }));
  return app;
}

describe("requireAdmin middleware", () => {
  it("401s when no authenticated user is present", async () => {
    const app = await appWith(null);
    const res = await app.request("/x");
    expect(res.status).toBe(401);
  });

  it("403s for an authenticated non-admin user", async () => {
    const app = await appWith({ id: "u1", roles: ["user"] });
    const res = await app.request("/x");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("FORBIDDEN");
  });

  it("lets an admin through", async () => {
    const app = await appWith({ id: "u1", roles: ["admin", "user"] });
    const res = await app.request("/x");
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("treats a missing roles array as non-admin (fails closed)", async () => {
    const app = await appWith({ id: "u1" });
    const res = await app.request("/x");
    expect(res.status).toBe(403);
  });
});
