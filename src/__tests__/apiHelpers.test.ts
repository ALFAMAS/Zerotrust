import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { HttpError, internalError, routeHandler } from "../shared/apiHelpers";

describe("shared API helpers", () => {
  it("does not expose internalError exception messages to clients", async () => {
    const app = new Hono();
    app.get("/internal", (c) =>
      internalError(c, new Error("database password=helper-secret failed"), "helper failed")
    );

    const res = await app.request("/internal", {
      headers: { "x-request-id": "req_helper" },
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({
      error: "INTERNAL_ERROR",
      message: "Internal server error",
      requestId: "req_helper",
    });
    expect(JSON.stringify(body)).not.toContain("helper-secret");
  });

  it("does not expose routeHandler exception messages to clients", async () => {
    const app = new Hono();
    app.get(
      "/wrapped",
      routeHandler(async () => {
        throw new Error("wrapped token=wrapped-secret failed");
      })
    );

    const res = await app.request("/wrapped", {
      headers: { "x-request-id": "req_wrapped" },
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({
      error: "INTERNAL_ERROR",
      message: "Internal server error",
      requestId: "req_wrapped",
    });
    expect(JSON.stringify(body)).not.toContain("wrapped-secret");
  });

  it("keeps explicit HttpError responses intact", async () => {
    const app = new Hono();
    app.get(
      "/known",
      routeHandler(async () => {
        throw new HttpError(409, "CONFLICT", "Already exists");
      })
    );

    const res = await app.request("/known");
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({ error: "CONFLICT", message: "Already exists" });
  });
});
