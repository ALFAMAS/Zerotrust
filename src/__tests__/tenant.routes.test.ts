import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";

// In-memory fake of the Drizzle-backed model so the route layer (the part that
// was rewired to async) is tested without a live database.
vi.mock("../models/tenant.model", () => {
  type T = Record<string, any>;
  let store: Map<string, T>;
  const reset = () => {
    store = new Map();
  };
  reset();
  const DEFAULTS = {
    allowedDomains: [],
    enforceSSO: false,
    mfaRequired: false,
    sessionTTL: 3600,
    maxUsers: 100,
    allowedCountries: [],
  };
  let counter = 0;
  return {
    __reset: reset,
    async getTenant(id: string) {
      return store.get(id);
    },
    async getTenantBySlug(slug: string) {
      return [...store.values()].find((t) => t.slug === slug);
    },
    async getAllTenants() {
      return [...store.values()];
    },
    async createTenant(data: T) {
      const now = new Date();
      const t = {
        id: `00000000-0000-0000-0000-${String(++counter).padStart(12, "0")}`,
        slug: data.slug,
        name: data.name,
        displayName: data.displayName,
        status: data.status ?? "active",
        plan: data.plan ?? "free",
        settings: { ...DEFAULTS, ...data.settings },
        oidcConfig: data.oidcConfig ?? undefined,
        samlConfig: data.samlConfig ?? undefined,
        createdAt: now,
        updatedAt: now,
      };
      store.set(t.id, t);
      return t;
    },
    async updateTenant(id: string, data: T) {
      const existing = store.get(id);
      if (!existing) return undefined;
      const updated = {
        ...existing,
        ...data,
        settings:
          data.settings !== undefined
            ? { ...existing.settings, ...data.settings }
            : existing.settings,
        updatedAt: new Date(),
      };
      store.set(id, updated);
      return updated;
    },
  };
});

import tenantRoutes from "../api/routes/tenant.routes";
import * as model from "../models/tenant.model";

function app(opts: { roles?: string[] } = { roles: ["admin"] }) {
  const a = new Hono();
  a.use("*", async (c, next) => {
    c.set("user", { id: "admin-1", roles: opts.roles ?? [] });
    return next();
  });
  return a.route("/", tenantRoutes);
}

function req(
  a: ReturnType<typeof app>,
  path: string,
  opts: { method?: string; body?: unknown } = {}
) {
  return a.request(path, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => {
  (model as any).__reset();
});

describe("Tenant routes", () => {
  it("requires the admin role", async () => {
    const res = await req(app({ roles: ["user"] }), "/", {
      method: "POST",
      body: { slug: "acme", name: "Acme" },
    });
    expect(res.status).toBe(403);
  });

  it("creates a tenant with merged default settings", async () => {
    const a = app();
    const res = await req(a, "/", { method: "POST", body: { slug: "acme", name: "Acme" } });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe("acme");
    expect(body.plan).toBe("free");
    expect(body.settings.sessionTTL).toBe(3600);
  });

  it("rejects an invalid slug", async () => {
    const res = await req(app(), "/", { method: "POST", body: { slug: "Bad Slug!", name: "X" } });
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate slug with 409", async () => {
    const a = app();
    await req(a, "/", { method: "POST", body: { slug: "acme", name: "Acme" } });
    const res = await req(a, "/", { method: "POST", body: { slug: "acme", name: "Acme 2" } });
    expect(res.status).toBe(409);
  });

  it("looks a tenant up by slug", async () => {
    const a = app();
    await req(a, "/", { method: "POST", body: { slug: "acme", name: "Acme" } });
    const res = await req(a, "/acme");
    expect(res.status).toBe(200);
    expect((await res.json()).slug).toBe("acme");
  });

  it("returns 404 for an unknown tenant", async () => {
    const res = await req(app(), "/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("changes a plan and updates maxUsers", async () => {
    const a = app();
    await req(a, "/", { method: "POST", body: { slug: "acme", name: "Acme" } });
    const res = await req(a, "/acme/plan", { method: "POST", body: { plan: "pro" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe("pro");
    expect(body.settings.maxUsers).toBe(10000);
  });

  it("soft-deletes a tenant", async () => {
    const a = app();
    await req(a, "/", { method: "POST", body: { slug: "acme", name: "Acme" } });
    const res = await req(a, "/acme", { method: "DELETE" });
    expect(res.status).toBe(200);
    const lookup = await req(a, "/acme");
    expect((await lookup.json()).status).toBe("deleted");
  });
});
