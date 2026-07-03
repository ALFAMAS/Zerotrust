import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { resolveTenant } from "../middleware/tenant";
import type { HonoEnv } from "../shared/types";

function appWithTenant() {
  const app = new Hono<HonoEnv>();
  app.use("*", resolveTenant());
  app.get("/probe", (c) => c.json({ tenantId: c.get("tenantId") ?? null }));
  return app;
}

describe("resolveTenant — M9 hardening", () => {
  it("does not trust X-Tenant-ID from unauthenticated callers", async () => {
    const app = appWithTenant();
    const res = await app.request("/probe", {
      headers: { "x-tenant-id": "evil-tenant" },
    });
    const body = await res.json();
    expect(body.tenantId).toBeNull();
  });

  it("does not trust ?tenant= query param", async () => {
    const app = appWithTenant();
    const res = await app.request("/probe?tenant=evil-tenant");
    const body = await res.json();
    expect(body.tenantId).toBeNull();
  });

  it("resolves tenant slug from subdomain", async () => {
    const app = appWithTenant();
    const res = await app.request("/probe", {
      headers: { host: "acme.auth.example.com" },
    });
    const body = await res.json();
    expect(body.tenantId).toBe("acme");
  });
});
