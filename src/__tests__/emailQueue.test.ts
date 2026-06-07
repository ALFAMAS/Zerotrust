import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(function () {
    return {
      add: vi.fn().mockResolvedValue({ id: "job-1" }),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
  Worker: vi.fn().mockImplementation(function () {
    return {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock("../config", () => ({
  getConfig: () => ({
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
    security: {
      bcryptRounds: 4,
      tokenSecretHex: "a".repeat(64),
      csfleMasterKeyHex: "b".repeat(64),
      csflekeyRotationIntervalDays: 90,
    },
    rateLimiting: { enabled: false, perIpLimit: 10, windowSecs: 60 },
    geofencing: { enabled: false, allowedCountries: [], allowedIpRanges: [] },
    mfa: {
      totpWindow: 1,
      otpExpirySecs: 900,
      maxOTPAttempts: 5,
      channels: {
        email: { enabled: true },
        sms: { enabled: false, provider: "twilio" },
        whatsapp: { enabled: false, provider: "twilio" },
        telegram: { enabled: false, botToken: "" },
      },
    },
    oauth: { providers: {} },
    elasticsearch: { enabled: false, host: "localhost", port: 9200, indexPrefix: "zeroauth" },
    logging: { level: "error", format: "json" },
  }),
}));

describe("Email Queue", () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it("returns null queue before initialization", async () => {
    const { getEmailQueue } = await import("../services/emailQueue");
    expect(getEmailQueue()).toBeNull();
  });

  it("enqueueEmail returns false when queue is not initialized", async () => {
    const { enqueueEmail } = await import("../services/emailQueue");
    const result = await enqueueEmail("welcome", "test@example.com", { name: "Test" });
    expect(result).toBe(false);
  });

  it("initializes queue with valid redis URI", async () => {
    const { initEmailQueue, getEmailQueue, shutdownEmailQueue } =
      await import("../services/emailQueue");
    await initEmailQueue("redis://:pass@localhost:6379");
    expect(getEmailQueue()).not.toBeNull();
    await shutdownEmailQueue();
  });

  it("enqueueEmail returns true after initialization", async () => {
    const { initEmailQueue, enqueueEmail, shutdownEmailQueue } =
      await import("../services/emailQueue");
    await initEmailQueue("redis://:pass@localhost:6379");
    const result = await enqueueEmail("welcome", "user@example.com", { name: "User" });
    expect(result).toBe(true);
    await shutdownEmailQueue();
  });

  it("gracefully skips init for invalid redis URI", async () => {
    const { initEmailQueue, getEmailQueue } = await import("../services/emailQueue");
    await initEmailQueue("not-a-valid-uri");
    expect(getEmailQueue()).toBeNull();
  });

  it("shutdownEmailQueue resets queue to null", async () => {
    const { initEmailQueue, shutdownEmailQueue, getEmailQueue } =
      await import("../services/emailQueue");
    await initEmailQueue("redis://:pass@localhost:6379");
    expect(getEmailQueue()).not.toBeNull();
    await shutdownEmailQueue();
    expect(getEmailQueue()).toBeNull();
  });
});
