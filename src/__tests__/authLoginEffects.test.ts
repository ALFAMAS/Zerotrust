import { describe, it, expect, vi, beforeEach } from "vitest";

const auditLoginSuccess = vi.fn();
const auditLoginFailure = vi.fn();
const dispatchEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("../services/auth/loginAudit.service", () => ({
  recordLoginSuccess: (...args: unknown[]) => auditLoginSuccess(...args),
  recordLoginFailure: (...args: unknown[]) => auditLoginFailure(...args),
}));

vi.mock("../modules/webhooks/delivery", () => ({
  dispatchEvent: (...args: unknown[]) => dispatchEvent(...args),
}));

describe("authLoginEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records successful login and dispatches webhook", async () => {
    const { recordLoginSuccess } = await import("../api/authLoginEffects");

    recordLoginSuccess({
      userId: "00000000-0000-0000-0000-000000000001",
      email: "alice@example.com",
      ip: "203.0.113.10",
      method: "password",
      sessionId: "00000000-0000-0000-0000-000000000002",
    });

    expect(auditLoginSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "00000000-0000-0000-0000-000000000001",
        email: "alice@example.com",
      })
    );

    expect(dispatchEvent).toHaveBeenCalledWith(
      "auth.login.success",
      expect.objectContaining({
        eventId: "login:00000000-0000-0000-0000-000000000002",
        userId: "00000000-0000-0000-0000-000000000001",
        email: "alice@example.com",
        method: "password",
        ipAddress: "203.0.113.10",
      })
    );
  });

  it("records failed login and dispatches webhook", async () => {
    const { recordLoginFailure } = await import("../api/authLoginEffects");

    recordLoginFailure({
      email: "nobody@example.com",
      ip: "203.0.113.11",
      reason: "invalid_credentials",
    });

    expect(auditLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "nobody@example.com",
        reason: "invalid_credentials",
      })
    );

    expect(dispatchEvent).toHaveBeenCalledWith(
      "auth.login.failure",
      expect.objectContaining({
        email: "nobody@example.com",
        reason: "invalid_credentials",
        ipAddress: "203.0.113.11",
        userId: null,
        eventId: expect.stringMatching(/^login-fail:/),
      })
    );
  });
});
