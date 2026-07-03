import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { dbGuard, fail, HttpError, internalError, ok, routeHandler } from "../shared/apiHelpers";

describe("shared API helpers", () => {
  it("ok returns JSON with the default 200 status", async () => {
    const app = new Hono();
    app.get("/ok", (c) => ok(c, { ready: true }));

    const res = await app.request("/ok");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ready: true });
  });

  it("ok honours a custom status code", async () => {
    const app = new Hono();
    app.post("/created", (c) => ok(c, { id: "1" }, 201));

    const res = await app.request("/created", { method: "POST" });
    expect(res.status).toBe(201);
  });

  it("fail returns a structured error payload", async () => {
    const app = new Hono();
    app.get("/missing", (c) => fail(c, 404, "NOT_FOUND", "Resource missing"));

    const res = await app.request("/missing");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND", message: "Resource missing" });
  });

  it("dbGuard returns fallback when storage is unavailable", async () => {
    const result = await dbGuard(
      () => Promise.reject(Object.assign(new Error('relation "users" does not exist'), { code: "42P01" })),
      { operation: "listUsers", fallback: () => [] }
    );
    expect(result).toEqual([]);
  });

  it("dbGuard rethrows non-storage errors", async () => {
    await expect(
      dbGuard(() => Promise.reject(new Error("connection refused")), {
        operation: "listUsers",
        fallback: () => [],
      })
    ).rejects.toThrow("connection refused");
  });

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
