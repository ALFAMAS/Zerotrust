import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  DEFAULT_JSON_BODY_LIMIT,
  bodySizeLimitMiddleware,
} from "../middleware/bodySizeLimit";
import type { HonoEnv } from "../shared/types";

describe("bodySizeLimitMiddleware", () => {
  it("rejects JSON bodies over 1 MiB with 413", async () => {
    const app = new Hono<HonoEnv>();
    app.use("*", bodySizeLimitMiddleware);
    app.post("/echo", async (c) => c.json({ ok: true }));

    const oversized = "x".repeat(DEFAULT_JSON_BODY_LIMIT + 1);
    const res = await app.request("/echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(oversized.length),
      },
      body: oversized,
    });

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("PAYLOAD_TOO_LARGE");
  });

  it("allows JSON bodies within the limit", async () => {
    const app = new Hono<HonoEnv>();
    app.use("*", bodySizeLimitMiddleware);
    app.post("/echo", async (c) => c.json({ ok: true }));

    const res = await app.request("/echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "2",
      },
      body: "{}",
    });

    expect(res.status).toBe(200);
  });

  it("skips GET requests", async () => {
    const app = new Hono<HonoEnv>();
    app.use("*", bodySizeLimitMiddleware);
    app.get("/health", (c) => c.json({ ok: true }));

    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });
});
