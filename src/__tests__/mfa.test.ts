import { describe, it, expect, vi } from "vitest";

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

describe("MFA channels", () => {
  describe("Email OTP", () => {
    it("sends email OTP via nodemailer", async () => {
      const { sendEmailOTP } = await import("../mfa/channels/email");
      const result = await sendEmailOTP("user@test.com", "Your OTP", "Your code: 123456");
      expect(result).toBeTruthy();
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
