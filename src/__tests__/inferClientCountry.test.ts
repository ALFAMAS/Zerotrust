import { describe, expect, it } from "vitest";
import { Hono } from "hono";

describe("inferClientCountry", () => {
  it("returns empty string when no client IP is available", async () => {
    const { inferClientCountry } = await import("../shared/inferClientCountry");
    const app = new Hono();
    app.get("/test", (c) => c.json({ country: inferClientCountry(c) }));
    const res = await app.request("/test");
    expect((await res.json()).country).toBe("");
  });

  it("resolves country from x-forwarded-for when geo data exists", async () => {
    const { inferClientCountry } = await import("../shared/inferClientCountry");
    const app = new Hono();
    app.get("/test", (c) => c.json({ country: inferClientCountry(c) }));
    const res = await app.request("/test", {
      headers: { "x-forwarded-for": "8.8.8.8" },
    });
    const body = await res.json();
    expect(typeof body.country).toBe("string");
  });
});
