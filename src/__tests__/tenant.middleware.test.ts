import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({
  getConfig: () => ({ rateLimiting: { enabled: true } }),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import type { HonoEnv } from "../shared/types";

describe("M9 — vestigial request-time tenant middleware removed", () => {
  it("does not export resolveTenant or requireTenant from the public API", async () => {
    const mod = await import("../index");
    expect(mod).not.toHaveProperty("resolveTenant");
    expect(mod).not.toHaveProperty("requireTenant");
  });
});

describe("tenantRateLimit — M9 hardening", () => {
  beforeEach(() => vi.resetModules());
  afterEach(async () => {
    const { clearRateLimiter } = await import("../middleware/rateLimiting");
    clearRateLimiter();
    vi.clearAllMocks();
  });

  it("does not trust X-Tenant-ID for rate-limit bucketing", async () => {
    const { tenantRateLimit } = await import("../middleware/rateLimiting");
    const app = new Hono<HonoEnv>();
    app.use("*", tenantRateLimit({ windowMs: 60_000, max: 1 }));
    app.get("/probe", (c) => c.json({ ok: true }));

    const headers = { "x-tenant-id": "evil-tenant", "x-forwarded-for": "203.0.113.10" };
    const first = await app.request("/probe", { headers });
    const second = await app.request("/probe", { headers });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("applies per-user quotas from configureTenantQuota using the authenticated user id", async () => {
    const { configureTenantQuota, tenantRateLimit } = await import("../middleware/rateLimiting");
    configureTenantQuota("user-1", { requestsPerMinute: 1 });

    const app = new Hono<HonoEnv>();
    app.use("*", async (c, next) => {
      c.set("user", {
        id: "user-1",
        email: "u@example.com",
        displayName: "User",
        roles: ["user"],
        status: "active",
      } as HonoEnv["Variables"]["user"]);
      return next();
    });
    app.use("*", tenantRateLimit({ windowMs: 60_000, max: 100 }));
    app.get("/probe", (c) => c.json({ ok: true }));

    const first = await app.request("/probe");
    const second = await app.request("/probe");

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});
