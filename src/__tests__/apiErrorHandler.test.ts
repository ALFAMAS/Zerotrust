import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import {
  internalErrorResponse,
  registerGlobalErrorHandler,
} from "../api/errorHandler";
import { zerotrustError } from "../shared/types";

function makeLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

describe("API global error handling", () => {
  it("returns a generic 500 body and logs sanitized server details with the request id", async () => {
    const logger = makeLogger();
    const app = new Hono();
    registerGlobalErrorHandler(app, logger);

    app.get("/boom", () => {
      throw new Error("db failed password=super-secret postgres://user:db-secret@localhost/app");
    });

    const res = await app.request("/boom", {
      headers: { "x-request-id": "req_123" },
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(res.headers.get("x-request-id")).toBe("req_123");
    expect(body).toEqual({
      error: "INTERNAL_ERROR",
      message: "Internal server error",
      requestId: "req_123",
    });
    expect(JSON.stringify(body)).not.toContain("super-secret");
    expect(JSON.stringify(body)).not.toContain("db-secret");

    expect(logger.error).toHaveBeenCalledWith(
      "Unhandled API error",
      expect.objectContaining({
        errorMessage: expect.not.stringContaining("super-secret"),
        errorStack: expect.not.stringContaining("db-secret"),
        method: "GET",
        path: "/boom",
        requestId: "req_123",
        status: 500,
      })
    );
  });

  it("preserves safe application errors without exposing stack details", async () => {
    const logger = makeLogger();
    const app = new Hono();
    registerGlobalErrorHandler(app, logger);

    app.get("/step-up", () => {
      throw new zerotrustError("MFA_REQUIRED", "Additional verification required", 403);
    });

    const res = await app.request("/step-up", {
      headers: { "x-request-id": "req_mfa" },
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({
      error: "MFA_REQUIRED",
      message: "Additional verification required",
      requestId: "req_mfa",
    });
    expect(JSON.stringify(body)).not.toContain("stack");
    expect(logger.warn).toHaveBeenCalledWith(
      "Handled API error",
      expect.objectContaining({
        errorCode: "MFA_REQUIRED",
        requestId: "req_mfa",
        status: 403,
      })
    );
  });

  it("converts thrown HTTP exceptions to JSON and sanitizes 5xx messages", async () => {
    const logger = makeLogger();
    const app = new Hono();
    registerGlobalErrorHandler(app, logger);

    app.get("/http", () => {
      throw new HTTPException(503, { message: "upstream token=secret-token timed out" });
    });

    const res = await app.request("/http", {
      headers: { "x-request-id": "req_http" },
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      error: "INTERNAL_ERROR",
      message: "Internal server error",
      requestId: "req_http",
    });
    expect(JSON.stringify(body)).not.toContain("secret-token");
    expect(logger.error).toHaveBeenCalledWith(
      "Unhandled API error",
      expect.objectContaining({
        errorMessage: expect.not.stringContaining("secret-token"),
        requestId: "req_http",
        status: 503,
      })
    );
  });

  it("sanitizes existing catch-block 500 responses through a shared helper", async () => {
    const logger = makeLogger();
    const app = new Hono();

    app.get("/caught", (c) =>
      internalErrorResponse(
        c,
        logger,
        "SLO status failed",
        new Error("prometheus password=metrics-secret unreachable")
      )
    );

    const res = await app.request("/caught", {
      headers: { "x-request-id": "req_caught" },
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({
      error: "INTERNAL_ERROR",
      message: "Internal server error",
      requestId: "req_caught",
    });
    expect(JSON.stringify(body)).not.toContain("metrics-secret");
    expect(logger.error).toHaveBeenCalledWith(
      "SLO status failed",
      expect.objectContaining({
        errorMessage: expect.not.stringContaining("metrics-secret"),
        requestId: "req_caught",
        status: 500,
      })
    );
  });
});
