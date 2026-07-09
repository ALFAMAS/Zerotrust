import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyPassword = vi.fn().mockResolvedValue(false);
const dummyPasswordHash = vi.fn().mockResolvedValue("$argon2id$dummyhashfordummycompare");

vi.mock("../shared/passwordHash", () => ({
  verifyPassword: (...args: unknown[]) => verifyPassword(...args),
  dummyPasswordHash: (...args: unknown[]) => dummyPasswordHash(...args),
  hashPassword: vi.fn(),
  passwordNeedsRehash: vi.fn().mockReturnValue(false),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../config", () => ({
  getConfig: () => ({
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
    security: { bcryptRounds: 4, tokenSecretHex: "a".repeat(64) },
    rateLimiting: { enabled: false, perIpLimit: 100, windowSecs: 60 },
    geofencing: { enabled: false, allowedCountries: [], allowedIpRanges: [] },
    mfa: { maxOTPAttempts: 5 },
  }),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("../middleware/credentialStuffing", () => ({
  isIpBlocked: vi.fn().mockReturnValue({ blocked: false }),
  recordIpLoginFailure: vi.fn(),
  recordIpLoginSuccess: vi.fn(),
}));

vi.mock("../services/shared/saasSettings.service", () => ({
  getSettings: vi.fn().mockResolvedValue({
    accountLockoutEnabled: false,
    accountLockoutThreshold: 8,
    accountLockoutDurationMinutes: 1,
  }),
}));

vi.mock("../middleware/accountLockout", () => ({
  getLoginThrottle: vi.fn().mockReturnValue({ delayed: false, requiresPow: false }),
  recordFailedLogin: vi.fn(),
  recordSuccessfulLogin: vi.fn(),
  verifyPowSolution: vi.fn().mockReturnValue({ ok: true }),
}));

vi.mock("../api/authLoginEffects", () => ({
  recordLoginFailure: vi.fn(),
  recordLoginSuccess: vi.fn(),
}));

function makeDbChain(returnValue: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
}

describe("POST /login timing enumeration resistance (SEC-2)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    verifyPassword.mockResolvedValue(false);
    dummyPasswordHash.mockResolvedValue("$argon2id$dummyhashfordummycompare");
  });

  afterEach(() => vi.clearAllMocks());

  it("runs verifyPassword against a dummy hash when the user is missing", async () => {
    const db = makeDbChain([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as never);

    const { default: router } = await import("../api/routes/auth.routes");
    const app = new Hono().route("/", router);
    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "secret" }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "INVALID_CREDENTIALS" });
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(verifyPassword.mock.calls[0]?.[1]).toBe("$argon2id$dummyhashfordummycompare");
    expect(dummyPasswordHash).toHaveBeenCalled();
  });
});
