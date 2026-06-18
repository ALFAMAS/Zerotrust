import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { requireApiKeyScopes } from "../middleware/apiKeyAuth";
import type { HonoEnv } from "../shared/types";

function appWithScopes(
  granted: string[] | undefined,
  required: string | string[],
  mode?: "all" | "any"
) {
  const app = new Hono<HonoEnv>();
  app.use("*", async (c, next) => {
    if (granted) c.set("apiKeyScopes", granted);
    await next();
  });
  app.get("/resource", requireApiKeyScopes(required, mode), (c) => c.json({ ok: true }));
  return app;
}

describe("requireApiKeyScopes", () => {
  it("allows when all required scopes are present", async () => {
    const app = appWithScopes(["read:data", "write:data"], ["read:data", "write:data"]);
    const res = await app.request("/resource");
    expect(res.status).toBe(200);
  });

  it("rejects when a required scope is missing", async () => {
    const app = appWithScopes(["read:data"], ["read:data", "write:data"]);
    const res = await app.request("/resource");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("INSUFFICIENT_SCOPE");
  });

  it("supports any-scope matching", async () => {
    const app = appWithScopes(["read:data"], ["write:data", "read:data"], "any");
    const res = await app.request("/resource");
    expect(res.status).toBe(200);
  });
});
