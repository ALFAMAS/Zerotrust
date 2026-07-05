import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zValidator } from "../middleware/zodValidation";

const bodySchema = z.object({
  email: z.string().email(),
  score: z.number().int(),
});

describe("zValidator canonical wrapper", () => {
  it("returns 422 with VALIDATION_ERROR on schema failure", async () => {
    const app = new Hono();
    app.post("/test", zValidator("json", bodySchema), (c) => {
      const body = c.req.valid("json");
      return c.json({ ok: true, email: body.email });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", score: "nope" }),
    });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.error).toBe("VALIDATION_ERROR");
    expect(json.issues).toBeDefined();
  });

  it("passes parsed output to the handler on success", async () => {
    const app = new Hono();
    app.post("/test", zValidator("json", bodySchema), (c) => {
      const body = c.req.valid("json");
      return c.json({ email: body.email, score: body.score });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", score: 5 }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ email: "user@example.com", score: 5 });
  });
});
