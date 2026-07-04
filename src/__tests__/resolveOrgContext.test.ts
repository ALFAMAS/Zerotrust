import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { orgIdFromRequest } from "../db/resolveOrgContext";
import type { HonoEnv } from "../shared/types";

describe("orgIdFromRequest", () => {
  it("prefers X-Org-Id header over path and query", async () => {
    const app = new Hono<HonoEnv>();
    app.get("/orgs/:orgId", (c) => c.json({ orgId: orgIdFromRequest(c, true) }));

    const res = await app.request("/orgs/path-org?orgId=query-org", {
      headers: { "x-org-id": "header-org" },
    });
    expect((await res.json()) as { orgId: string }).toEqual({ orgId: "header-org" });
  });

  it("falls back to :orgId path param", async () => {
    const app = new Hono<HonoEnv>();
    app.get("/orgs/:orgId", (c) => c.json({ orgId: orgIdFromRequest(c) }));

    const res = await app.request("/orgs/path-org");
    expect((await res.json()) as { orgId: string }).toEqual({ orgId: "path-org" });
  });

  it("reads orgId query when allowQuery is true", async () => {
    const app = new Hono<HonoEnv>();
    app.get("/search", (c) => c.json({ orgId: orgIdFromRequest(c, true) }));

    const res = await app.request("/search?orgId=query-org");
    expect((await res.json()) as { orgId: string }).toEqual({ orgId: "query-org" });
  });
});
