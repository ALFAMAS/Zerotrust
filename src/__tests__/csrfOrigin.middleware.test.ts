import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  csrfOriginMiddleware,
  CSRF_EXEMPT_PREFIXES,
  isOriginTrusted,
  trustedOriginsFromEnv,
} from "../middleware/csrfOrigin";

describe("csrfOrigin middleware (SEC-7)", () => {
  it("allows GET without origin", async () => {
    const app = new Hono();
    app.use("*", csrfOriginMiddleware({ NODE_ENV: "development" }));
    app.get("/ok", (c) => c.json({ ok: true }));

    const res = await app.request("/ok");
    expect(res.status).toBe(200);
  });

  it("allows state-changing requests with Bearer auth", async () => {
    const app = new Hono();
    app.use("*", csrfOriginMiddleware({ NODE_ENV: "development" }));
    app.post("/items", (c) => c.json({ ok: true }));

    const res = await app.request("/items", {
      method: "POST",
      headers: { Authorization: "Bearer access-token" },
    });
    expect(res.status).toBe(200);
  });

  it("allows cookie-less POST (non-browser clients)", async () => {
    const app = new Hono();
    app.use("*", csrfOriginMiddleware({ NODE_ENV: "development" }));
    app.post("/items", (c) => c.json({ ok: true }));

    const res = await app.request("/items", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("blocks cookie-authenticated POST with untrusted origin", async () => {
    const app = new Hono();
    app.use("*", csrfOriginMiddleware({ NODE_ENV: "development", APP_URL: "http://localhost:3000" }));
    app.post("/items", (c) => c.json({ ok: true }));

    const res = await app.request("/items", {
      method: "POST",
      headers: {
        Cookie: "za_refresh_token=abc",
        Origin: "https://evil.example",
      },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("CSRF_ORIGIN_MISMATCH");
  });

  it("allows cookie-authenticated POST with trusted dev origin", async () => {
    const app = new Hono();
    app.use("*", csrfOriginMiddleware({ NODE_ENV: "development", APP_URL: "http://localhost:3000" }));
    app.post("/items", (c) => c.json({ ok: true }));

    const res = await app.request("/items", {
      method: "POST",
      headers: {
        Cookie: "za_access_token=abc",
        Origin: "http://localhost:3000",
      },
    });
    expect(res.status).toBe(200);
  });

  it("exempts signed webhook paths", () => {
    expect(CSRF_EXEMPT_PREFIXES).toContain("/billing/webhook");
  });

  it("trustedOriginsFromEnv includes APP_URL in development", () => {
    const origins = trustedOriginsFromEnv({
      NODE_ENV: "development",
      APP_URL: "http://localhost:3000",
    });
    expect(origins).toContain("http://localhost:3000");
    expect(isOriginTrusted("http://localhost:3000", origins)).toBe(true);
  });
});
