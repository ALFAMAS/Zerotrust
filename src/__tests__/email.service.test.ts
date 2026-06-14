import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock nodemailer ────────────────────────────────────────────────────────

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test-message-id" });

vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
}));

// ── Mock logger ────────────────────────────────────────────────────────────

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe("email.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure MAIL_HOST is set so the real transport path is used
    process.env.MAIL_HOST = "smtp.test.local";
    process.env.MAIL_FROM = "noreply@test.local";
  });

  it("sendWelcomeEmail: calls sendMail with correct to/subject and html contains the name", async () => {
    const { sendWelcomeEmail } = await import("../services/email.service");
    await sendWelcomeEmail("alice@example.com", {
      name: "Alice",
      loginUrl: "http://localhost:3000/login",
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("alice@example.com");
    expect(call.subject).toContain("Welcome");
    expect(call.html).toContain("Alice");
  });

  it("sendMagicLinkEmail: html contains the magic link URL", async () => {
    const { sendMagicLinkEmail } = await import("../services/email.service");
    const magicLinkUrl = "http://localhost:3000/auth/magic-link/verify?token=abc123";
    await sendMagicLinkEmail("bob@example.com", {
      name: "Bob",
      magicLinkUrl,
      expiresInMinutes: 15,
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("bob@example.com");
    expect(call.html).toContain(magicLinkUrl);
  });

  it("sendOtpEmail: html contains the OTP code", async () => {
    const { sendOtpEmail } = await import("../services/email.service");
    await sendOtpEmail("carol@example.com", {
      name: "Carol",
      code: "987654",
      expiresInMinutes: 10,
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("carol@example.com");
    expect(call.html).toContain("987654");
  });

  it("sendPasswordResetEmail: html contains the reset URL", async () => {
    const { sendPasswordResetEmail } = await import("../services/email.service");
    const resetUrl = "http://localhost:3000/reset-password?token=xyz";
    await sendPasswordResetEmail("dave@example.com", {
      name: "Dave",
      resetUrl,
      expiresInMinutes: 30,
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("dave@example.com");
    expect(call.html).toContain(resetUrl);
  });

  it("sendSecurityAlertEmail: html contains the action string", async () => {
    const { sendSecurityAlertEmail } = await import("../services/email.service");
    const action = "New sign-in from unknown device";
    await sendSecurityAlertEmail("eve@example.com", {
      name: "Eve",
      action,
      device: "Chrome on Windows",
      location: "New York, US",
      time: "2026-06-04 10:30 UTC",
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("eve@example.com");
    expect(call.html).toContain(action);
  });

  it("sendEmail failure (sendMail throws) does NOT throw from the send function", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("SMTP connection refused"));

    const { sendWelcomeEmail } = await import("../services/email.service");

    // Should not throw
    await expect(
      sendWelcomeEmail("frank@example.com", {
        name: "Frank",
        loginUrl: "http://localhost:3000/login",
      })
    ).resolves.toBeUndefined();
  });
});
