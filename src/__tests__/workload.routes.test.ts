import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../workload", () => ({
  createWorkloadCredential: vi.fn(),
  validateWorkloadCredential: vi.fn(),
  getValidWorkloadCredential: vi.fn(),
  listWorkloadCredentials: vi.fn(),
  revokeWorkloadCredential: vi.fn(),
}));

vi.mock("../config", () => ({
  getConfig: () => ({
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
    security: { tokenSecretHex: "a".repeat(64) },
  }),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  auditLog: vi.fn(),
}));

vi.mock("../services/token.service", () => ({
  TokenService: vi.fn().mockImplementation(function () {
    return {
      init: vi.fn().mockResolvedValue(undefined),
      signAccessToken: vi.fn().mockResolvedValue("agent-token"),
    };
  }),
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "admin-1", email: "admin@example.com", roles: ["admin"] });
    await next();
  }),
}));

import workloadRoutes from "../api/routes/workload.routes";
import { getValidWorkloadCredential } from "../workload";

const app = new Hono();
app.route("/workload", workloadRoutes as any);

describe("workload token exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid workload credentials", async () => {
    vi.mocked(getValidWorkloadCredential).mockResolvedValueOnce(null as any);

    const res = await app.request("/workload/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workloadId: "billing-bot", secret: "bad" }),
    });

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("INVALID_WORKLOAD_CREDENTIAL");
  });

  it("rejects scopes the workload credential does not allow", async () => {
    vi.mocked(getValidWorkloadCredential).mockResolvedValueOnce({
      workloadId: "billing-bot",
      scopes: ["billing:read"],
      ttl: 600,
    } as any);

    const res = await app.request("/workload/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workloadId: "billing-bot",
        secret: "ok",
        scopes: ["billing:write"],
      }),
    });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("INVALID_SCOPE");
  });

  it("issues a scoped agent bearer token", async () => {
    vi.mocked(getValidWorkloadCredential).mockResolvedValueOnce({
      workloadId: "billing-bot",
      scopes: ["billing:read", "invoices:read"],
      ttl: 600,
    } as any);

    const res = await app.request("/workload/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workloadId: "billing-bot",
        secret: "ok",
        scopes: ["billing:read"],
        ttl: 300,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBe("agent-token");
    expect(body.principalType).toBe("agent");
    expect(body.workloadId).toBe("billing-bot");
    expect(body.scopes).toEqual(["billing:read"]);
    expect(body.expiresIn).toBe(300);
  });
});
