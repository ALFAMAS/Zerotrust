import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../config", () => ({
  getConfig: () => ({
    session: {
      defaultTTL: 3600,
      refreshTokenTTL: 604800,
      maxConcurrentDevices: 5,
    },
    security: {
      bcryptRounds: 4,
      tokenSecretHex: "a".repeat(64),
      csfleMasterKeyHex: "b".repeat(64),
      csflekeyRotationIntervalDays: 90,
    },
    rateLimiting: { enabled: false, perIpLimit: 100, windowSecs: 60 },
    geofencing: { enabled: false, allowedCountries: [], allowedIpRanges: [] },
    mfa: {
      totpWindow: 1,
      otpExpirySecs: 900,
      maxOTPAttempts: 5,
      channels: {
        email: { enabled: true },
        telegram: { enabled: false, botToken: "" },
      },
    },
    oauth: { providers: {} },
    elasticsearch: {
      enabled: false,
      host: "localhost",
      port: 9200,
      indexPrefix: "zerotrust",
    },
    logging: { level: "error", format: "json" },
  }),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../services/shared/saasSettings.service", () => ({
  getSettings: vi.fn().mockResolvedValue({
    appName: "zerotrust Test",
    appUrl: "http://localhost:3000",
    magicLinkEnabled: true,
  }),
}));

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

// ── Helpers ────────────────────────────────────────────────────────────────

const USER_ID = "00000000-0000-0000-0000-000000000001";

function makeDbWithUser() {
  const selectChain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ id: USER_ID }]),
  };
  return {
    ...selectChain,
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "otp-1" }]),
    delete: vi.fn().mockReturnThis(),
  };
}

function makeDbWithNoUser() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockReturnThis(),
  };
}

// ── sendMagicLink ──────────────────────────────────────────────────────────

describe("sendMagicLink", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it("returns { sent: true } for a known email", async () => {
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(makeDbWithUser() as any);

    const { sendMagicLink } = await import("../services/auth/magicLink.service");
    const result = await sendMagicLink("alice@example.com");
    expect(result.sent).toBe(true);
  });

  it("returns { sent: true } silently for an unknown email (no enumeration)", async () => {
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(makeDbWithNoUser() as any);

    const { sendMagicLink } = await import("../services/auth/magicLink.service");
    const result = await sendMagicLink("nobody@example.com");
    expect(result.sent).toBe(true);
  });

  it("inserts an OTP record into the database for a known user", async () => {
    const db = makeDbWithUser();
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { sendMagicLink } = await import("../services/auth/magicLink.service");
    await sendMagicLink("alice@example.com");

    // insert should have been called once (for the OTP)
    expect(db.insert).toHaveBeenCalled();
    expect(db.values).toHaveBeenCalled();
  });

  it("stores a SHA-256 hash of the token, not the raw token", async () => {
    const db = makeDbWithUser();
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const capturedValues: any[] = [];
    db.values.mockImplementation((v: any) => {
      capturedValues.push(v);
      return db;
    });
    db.returning.mockResolvedValue([{ id: "otp-1" }]);

    const { sendMagicLink } = await import("../services/auth/magicLink.service");
    await sendMagicLink("alice@example.com");

    expect(capturedValues.length).toBeGreaterThan(0);
    const otpRecord = capturedValues[0];
    // The stored code should be a 64-char hex string (SHA-256 hash)
    expect(otpRecord.code).toMatch(/^[0-9a-f]{64}$/);
    // It must not be the raw 32-byte hex token (which would be stored directly)
    expect(otpRecord.code).not.toHaveLength(32);
  });

  it("sets an expiry approximately 15 minutes in the future", async () => {
    const db = makeDbWithUser();
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const capturedValues: any[] = [];
    db.values.mockImplementation((v: any) => {
      capturedValues.push(v);
      return db;
    });
    db.returning.mockResolvedValue([{ id: "otp-1" }]);

    const before = Date.now();
    const { sendMagicLink } = await import("../services/auth/magicLink.service");
    await sendMagicLink("alice@example.com");
    const after = Date.now();

    const otpRecord = capturedValues[0];
    expect(otpRecord.expiresAt).toBeInstanceOf(Date);
    const expiresMs = otpRecord.expiresAt.getTime();
    // Should be ~15 minutes (900 seconds) from now
    expect(expiresMs).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 1000);
  });

  it("does not throw when database insert fails (graceful error)", async () => {
    const db = makeDbWithUser();
    db.returning.mockRejectedValue(new Error("DB write error"));
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { sendMagicLink } = await import("../services/auth/magicLink.service");
    const result = await sendMagicLink("alice@example.com");
    expect(result.sent).toBe(true);
  });
});

// ── verifyMagicLink ────────────────────────────────────────────────────────

describe("verifyMagicLink", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it("returns null when no matching record exists", async () => {
    const db = makeDbWithNoUser();
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { verifyMagicLink } = await import("../services/auth/magicLink.service");
    const result = await verifyMagicLink(
      "alice@example.com",
      "nonexistent-token",
    );
    expect(result).toBeNull();
  });

  it("returns userId and userEmail when the token is valid and not expired", async () => {
    const crypto = await import("crypto");
    const rawToken = "valid-raw-token-abc123";
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "otp-1",
            userId: USER_ID,
            code: tokenHash,
            target: "alice@example.com",
            channel: "email",
            type: "login",
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          },
        ])
        .mockResolvedValueOnce([{ id: USER_ID, email: "alice@example.com" }]),
      delete: vi.fn().mockReturnThis(),
    };

    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { verifyMagicLink } = await import("../services/auth/magicLink.service");
    const result = await verifyMagicLink("alice@example.com", rawToken);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe(USER_ID);
    expect(result?.userEmail).toBe("alice@example.com");
  });

  it("deletes the OTP record after successful verification (single-use)", async () => {
    const crypto = await import("crypto");
    const rawToken = "single-use-token";
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const deleteMock = vi.fn().mockReturnThis();
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "otp-1",
            userId: USER_ID,
            code: tokenHash,
            target: "alice@example.com",
            channel: "email",
            type: "login",
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          },
        ])
        .mockResolvedValueOnce([{ id: USER_ID, email: "alice@example.com" }]),
      delete: deleteMock,
    };

    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { verifyMagicLink } = await import("../services/auth/magicLink.service");
    await verifyMagicLink("alice@example.com", rawToken);

    // delete must have been called with the OTPs table
    expect(deleteMock).toHaveBeenCalled();
  });

  it("returns null on second use — record already deleted after first verification", async () => {
    // First call returns a valid record; second call returns nothing (already deleted)
    const crypto = await import("crypto");
    const rawToken = "reuse-attempt-token";
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        // First call: OTP found
        .mockResolvedValueOnce([
          {
            id: "otp-1",
            userId: USER_ID,
            code: tokenHash,
            target: "alice@example.com",
            channel: "email",
            type: "login",
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          },
        ])
        // Second call: user lookup
        .mockResolvedValueOnce([{ id: USER_ID, email: "alice@example.com" }])
        // Third call (second verify attempt): OTP already gone
        .mockResolvedValueOnce([]),
      delete: vi.fn().mockReturnThis(),
    };

    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { verifyMagicLink } = await import("../services/auth/magicLink.service");

    const firstResult = await verifyMagicLink("alice@example.com", rawToken);
    expect(firstResult).not.toBeNull();

    const secondResult = await verifyMagicLink("alice@example.com", rawToken);
    expect(secondResult).toBeNull();
  });

  it("returns null when token is expired (expiresAt in the past)", async () => {
    // The service uses gt(otpsTable.expiresAt, now) in the query — the DB mock
    // simulates an expired query by returning empty results.
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      // DB enforces expiry via gt() predicate, so expired token returns []
      limit: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockReturnThis(),
    };

    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { verifyMagicLink } = await import("../services/auth/magicLink.service");
    const result = await verifyMagicLink("alice@example.com", "expired-token");
    expect(result).toBeNull();
  });

  it("returns null when user record is not found after OTP lookup", async () => {
    const crypto = await import("crypto");
    const rawToken = "orphan-otp-token";
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "otp-1",
            userId: "deleted-user-id",
            code: tokenHash,
            target: "alice@example.com",
            channel: "email",
            type: "login",
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          },
        ])
        // User lookup returns nothing (deleted/not found)
        .mockResolvedValueOnce([]),
      delete: vi.fn().mockReturnThis(),
    };

    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { verifyMagicLink } = await import("../services/auth/magicLink.service");
    const result = await verifyMagicLink("alice@example.com", rawToken);
    expect(result).toBeNull();
  });

  it("returns null gracefully when database throws", async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error("DB error")),
      delete: vi.fn().mockReturnThis(),
    };

    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { verifyMagicLink } = await import("../services/auth/magicLink.service");
    const result = await verifyMagicLink("alice@example.com", "any-token");
    expect(result).toBeNull();
  });
});

// ── Rate-limit concern: per-email uniqueness ───────────────────────────────

describe("Magic link token uniqueness", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it("generates distinct tokens for successive requests", async () => {
    const capturedValues: any[] = [];

    const db: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: USER_ID }]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockImplementation((v: any) => {
        capturedValues.push({ ...v });
        return db;
      }),
      returning: vi.fn().mockResolvedValue([{ id: "otp-x" }]),
      delete: vi.fn().mockReturnThis(),
    };

    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { sendMagicLink } = await import("../services/auth/magicLink.service");
    await sendMagicLink("alice@example.com");
    await sendMagicLink("alice@example.com");

    expect(capturedValues.length).toBe(2);
    expect(capturedValues[0].code).not.toBe(capturedValues[1].code);
  });
});
