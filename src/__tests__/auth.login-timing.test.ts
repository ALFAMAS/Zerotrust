import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bcryptCompare = vi.fn().mockResolvedValue(false);
const bcryptHash = vi.fn().mockResolvedValue("$2a$04$dummyhashfordummycompare");

vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => bcryptCompare(...args),
    hash: (...args: unknown[]) => bcryptHash(...args),
  },
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
    bcryptCompare.mockResolvedValue(false);
    bcryptHash.mockResolvedValue("$2a$04$dummyhashfordummycompare");
  });

  afterEach(() => vi.clearAllMocks());

  it("runs bcrypt.compare against a dummy hash when the user is missing", async () => {
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
    expect(bcryptCompare).toHaveBeenCalledTimes(1);
    expect(bcryptCompare.mock.calls[0]?.[1]).toBe("$2a$04$dummyhashfordummycompare");
    expect(bcryptHash).toHaveBeenCalled();
  });
});
