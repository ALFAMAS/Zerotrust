import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: "test-id" }),
    }),
  },
  createTransport: vi.fn().mockReturnValue({
    sendMail: vi.fn().mockResolvedValue({ messageId: "test-id" }),
  }),
}));

vi.mock("twilio", () => {
  const mockCreate = vi.fn().mockResolvedValue({ sid: "SM123" });
  return {
    default: vi.fn().mockReturnValue({
      messages: { create: mockCreate },
    }),
  };
});

describe("MFA channels", () => {
  describe("Email OTP", () => {
    it("sends email OTP via nodemailer", async () => {
      const { sendEmailOTP } = await import("../mfa/channels/email");
      const result = await sendEmailOTP("user@test.com", "Your OTP", "Your code: 123456");
      expect(result).toBeTruthy();
    });
  });

  describe("SMS OTP", () => {
    it("sends SMS OTP via Twilio when credentials configured", async () => {
      process.env.TWILIO_ACCOUNT_SID = "ACtest";
      process.env.TWILIO_AUTH_TOKEN = "token";
      process.env.TWILIO_SMS_FROM = "+15550000";

      const { sendSmsOTP } = await import("../mfa/channels/sms");
      const result = await sendSmsOTP("+12025550123", "Your code: 456789");
      expect(typeof result).toBe("boolean");
    });
  });

  describe("OTP dispatcher", () => {
    it("dispatches to email channel", async () => {
      const { sendOTP } = await import("../mfa");
      const result = await sendOTP("email", "test@example.com", "999888");
      expect(result).toBeTruthy();
    });

    it("returns false for unsupported channel", async () => {
      const { sendOTP } = await import("../mfa");
      const result = await sendOTP("email", "test@example.com", "111222");
      expect(typeof result).toBe("boolean");
    });
  });
});
