import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../config", () => ({
  getConfig: () => ({
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
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
      channels: { email: { enabled: true }, telegram: { enabled: false, botToken: "" } },
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
vi.mock("../middleware/sessionControl", () => ({
  enforceMaxConcurrentDevices: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  auditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../middleware/rateLimiting", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../services/auth/userStateCache.service", () => ({
  invalidateUserCache: vi.fn().mockResolvedValue(undefined),
}));

function makeDb() {
  const chain: any = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };
  return chain;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("PATCH /auth/me optimistic locking", () => {
  it("returns 409 when the expected version does not match", async () => {
    const db = makeDb();
    db.returning.mockResolvedValueOnce([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { Hono } = await import("hono");
    const authRoutes = (await import("../api/routes/auth.routes")).default;

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("user", {
        id: "user-1",
        email: "u@example.com",
        displayName: "User",
        roles: ["user"],
        status: "active",
      } as any);
      return next();
    });
    app.route("/auth", authRoutes);

    const res = await app.request("/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "New Name", version: 1 }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("VERSION_CONFLICT");
  });

  it("updates the profile when the version matches", async () => {
    const db = makeDb();
    db.returning.mockResolvedValueOnce([
      {
        id: "user-1",
        email: "u@example.com",
        username: null,
        displayName: "New Name",
        avatarUrl: null,
        roles: ["user"],
        status: "active",
        phone: null,
        locale: "en",
        version: 3,
        updatedAt: new Date(),
      },
    ]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { Hono } = await import("hono");
    const authRoutes = (await import("../api/routes/auth.routes")).default;

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("user", {
        id: "user-1",
        email: "u@example.com",
        displayName: "User",
        roles: ["user"],
        status: "active",
      } as any);
      return next();
    });
    app.route("/auth", authRoutes);

    const res = await app.request("/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "New Name", version: 2 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.displayName).toBe("New Name");
    expect(body.version).toBe(3);
  });
});
