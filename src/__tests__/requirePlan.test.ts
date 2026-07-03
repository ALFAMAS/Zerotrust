import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const selectResults: unknown[][] = [];

vi.mock("../db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectResults.shift() ?? [],
        }),
      }),
    }),
  }),
}));

import { requirePlan, resolvePlan } from "../middleware/requirePlan";
import type { HonoEnv } from "../shared/types";

function appWithPlan(feature: string, orgIdParam?: string) {
  const app = new Hono<HonoEnv>();
  app.use("*", async (c, next) => {
    c.set("user", {
      id: "user-1",
      email: "u@example.com",
      displayName: "User",
      roles: ["user"],
      status: "active",
    });
    return next();
  });
  app.get(
    "/orgs/:orgId/feature",
    requirePlan(feature, orgIdParam ? { orgIdParam } : undefined),
    (c) => c.json({ ok: true })
  );
  return app;
}

describe("requirePlan middleware (FS-2)", () => {
  beforeEach(() => {
    selectResults.length = 0;
  });

  it("resolvePlan prefers org subscription over user subscription", async () => {
    selectResults.push([{ plan: "enterprise", status: "active" }]);
    const plan = await resolvePlan("user-1", "org-1");
    expect(plan).toBe("enterprise");
  });

  it("blocks free plan from enterprise-only feature", async () => {
    selectResults.push([]);
    selectResults.push([{ plan: "free", status: "active" }]);
    const res = await appWithPlan("ssoSaml", "orgId").request("/orgs/org-1/feature");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("PLAN_REQUIRED");
    expect(body.requiredFeature).toBe("ssoSaml");
  });

  it("allows pro plan for customRoles feature", async () => {
    selectResults.push([{ plan: "pro", status: "active" }]);
    const res = await appWithPlan("customRoles", "orgId").request("/orgs/org-1/feature");
    expect(res.status).toBe(200);
  });
});
