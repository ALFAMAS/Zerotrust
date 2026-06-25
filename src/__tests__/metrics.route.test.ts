import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { metricsAuthMiddleware, metricsMiddleware, metricsRoute } from "../metrics";

function metricsApp() {
  const app = new Hono();
  app.use("*", metricsMiddleware());
  app.get("/metrics", metricsAuthMiddleware(), metricsRoute);
  app.get("/probe", (c) => c.json({ ok: true }));
  return app;
}

describe("metricsMiddleware + /metrics route", () => {
  it("records request duration and exposes it from the app registry", async () => {
    delete process.env.METRICS_AUTH_TOKEN;
    const app = metricsApp();
    await app.request("/probe");
    const res = await app.request("/metrics");
    expect(res.status).toBe(200);
    const body = await res.text();
    // The histogram is recorded on the app's own registry — a regression here
    // means /metrics is serving the wrong (empty) registry again.
    expect(body).toContain("zerotrust_request_duration_seconds");
    expect(body).toContain('route="/probe"');
  });
});

describe("metricsAuthMiddleware", () => {
  const original = process.env.METRICS_AUTH_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.METRICS_AUTH_TOKEN;
    else process.env.METRICS_AUTH_TOKEN = original;
  });

  it("allows access when no token is configured", async () => {
    delete process.env.METRICS_AUTH_TOKEN;
    const res = await metricsApp().request("/metrics");
    expect(res.status).toBe(200);
  });

  it("401s without the bearer token when one is configured", async () => {
    process.env.METRICS_AUTH_TOKEN = "s3cret";
    const res = await metricsApp().request("/metrics");
    expect(res.status).toBe(401);
  });

  it("rejects a wrong token", async () => {
    process.env.METRICS_AUTH_TOKEN = "s3cret";
    const res = await metricsApp().request("/metrics", {
      headers: { Authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
  });

  it("allows the correct bearer token", async () => {
    process.env.METRICS_AUTH_TOKEN = "s3cret";
    const res = await metricsApp().request("/metrics", {
      headers: { Authorization: "Bearer s3cret" },
    });
    expect(res.status).toBe(200);
  });
});
