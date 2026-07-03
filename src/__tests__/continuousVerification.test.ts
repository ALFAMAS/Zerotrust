import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import {
  recordVerification,
  requireReverification,
  sensitiveReverification,
  verificationStore,
} from "../middleware/continuousVerification";

const SESSION_ID = "sess-001";

function appWith(middleware: ReturnType<typeof requireReverification>) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", {
      id: SESSION_ID,
      lastActivityAt: new Date(),
      country: "US",
      deviceFingerprint: { userAgent: "Mozilla/5.0" },
      anomalyFlags: { score: 0 },
    } as never);
    c.set("inferredCountry", "US");
    await next();
  });
  app.use("*", middleware);
  app.post("/sensitive", (c) => c.json({ ok: true }));
  return app;
}

describe("requireReverification middleware", () => {
  beforeEach(() => {
    verificationStore.clear();
  });

  it("blocks sensitive operations until re-verified", async () => {
    const app = appWith(sensitiveReverification);
    const res = await app.request("/sensitive", { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("REVERIFICATION_REQUIRED");
    expect(body.level).toBe("soft");
  });

  it("allows a sensitive operation after recent verification", async () => {
    recordVerification(SESSION_ID, "soft");
    const app = appWith(sensitiveReverification);
    const res = await app.request("/sensitive", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("requires hard verification when risk escalates to hard", async () => {
    recordVerification(SESSION_ID, "soft");
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("session", {
        id: SESSION_ID,
        lastActivityAt: new Date(),
        country: "US",
        deviceFingerprint: { userAgent: "Mozilla/5.0" },
        anomalyFlags: { score: 0.95 },
      } as never);
      c.set("inferredCountry", "US");
      await next();
    });
    app.use("*", sensitiveReverification);
    app.post("/sensitive", (c) => c.json({ ok: true }));

    const res = await app.request("/sensitive", { method: "POST" });
    expect(res.status).toBe(401);
    expect((await res.json()).level).toBe("hard");
  });

  it("accepts hard verification for a hard-level challenge", async () => {
    recordVerification(SESSION_ID, "hard");
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("session", {
        id: SESSION_ID,
        lastActivityAt: new Date(),
        country: "US",
        deviceFingerprint: { userAgent: "Mozilla/5.0" },
        anomalyFlags: { score: 0.95 },
      } as never);
      c.set("inferredCountry", "US");
      await next();
    });
    app.use("*", sensitiveReverification);
    app.post("/sensitive", (c) => c.json({ ok: true }));

    const res = await app.request("/sensitive", { method: "POST" });
    expect(res.status).toBe(200);
  });
});
