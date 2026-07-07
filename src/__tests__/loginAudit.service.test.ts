import { describe, it, expect, vi, beforeEach } from "vitest";

const auditLog = vi.fn().mockResolvedValue(undefined);

vi.mock("../logger", () => ({
  auditLog: (...args: unknown[]) => auditLog(...args),
}));

describe("loginAudit.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records successful login in audit chain", async () => {
    const { recordLoginSuccess } = await import("../services/auth/loginAudit.service");

    recordLoginSuccess({
      userId: "00000000-0000-0000-0000-000000000001",
      email: "alice@example.com",
      ip: "203.0.113.10",
      method: "password",
      sessionId: "00000000-0000-0000-0000-000000000002",
    });

    expect(auditLog).toHaveBeenCalledWith(
      "auth.login.success",
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000001",
      true,
      expect.objectContaining({
        method: "password",
        ipAddress: "203.0.113.10",
        sessionId: "00000000-0000-0000-0000-000000000002",
      })
    );
  });

  it("records failed login in audit chain", async () => {
    const { recordLoginFailure } = await import("../services/auth/loginAudit.service");

    recordLoginFailure({
      email: "nobody@example.com",
      ip: "203.0.113.11",
      reason: "invalid_credentials",
    });

    expect(auditLog).toHaveBeenCalledWith(
      "auth.login.failure",
      "nobody@example.com",
      "nobody@example.com",
      false,
      expect.objectContaining({
        reason: "invalid_credentials",
        ipAddress: "203.0.113.11",
        email: "nobody@example.com",
      })
    );
  });
});
