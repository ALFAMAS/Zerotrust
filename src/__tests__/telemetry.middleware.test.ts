import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerSpies = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

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
      channels: { email: { enabled: true } },
    },
    oauth: { providers: {} },
    elasticsearch: {
      enabled: false,
      host: "localhost",
      port: 9200,
      indexPrefix: "zerotrust",
    },
    logging: { level: "info", format: "json" },
  }),
}));

vi.mock("../logger", () => ({
  getLogger: () => loggerSpies,
}));

vi.mock("../middleware/sessionControl", () => ({
  enforceMaxConcurrentDevices: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../oauth/provider.factory", () => ({
  getProviderAdapter: vi.fn(),
}));

vi.mock("../services/auth/passwordBreach.service", () => ({
  isBreachCheckEnabled: () => false,
  checkPasswordBreached: vi.fn().mockResolvedValue({ breached: false, count: 0 }),
  rejectIfBreached: vi.fn().mockResolvedValue(null),
}));

vi.mock("../services/auth/accountTakeover.service", () => ({
  recordAndRespond: vi.fn().mockResolvedValue(false),
  recordSensitiveChange: vi.fn().mockResolvedValue(undefined),
  assessTakeoverRisk: vi.fn().mockResolvedValue({ flagged: false, recentEvents: [] }),
}));

vi.mock("../services/auth/loginNotification.service", () => ({
  notifyIfNewDevice: vi.fn().mockResolvedValue(undefined),
}));

const USER_ID = "00000000-0000-0000-0000-000000000001";
const SESSION_ID = "00000000-0000-0000-0000-000000000002";

function makeDbChain(returnValue: any) {
  const chain: any = {
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    returning: vi.fn().mockResolvedValue(returnValue),
    select: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  };
  return chain;
}

function makeActiveUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: "alice@example.com",
    passwordHash: "",
    displayName: "Alice",
    mfa: {
      totp: { enabled: false, backupCodes: [] },
      webauthn: { enabled: false },
    },
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    tokenId: "some-jti",
    deviceFingerprint: {},
    ipAddress: "127.0.0.1",
    expiresAt: new Date(Date.now() + 3_600_000),
    lastActivityAt: new Date(),
    isActive: true,
    revokedAt: null,
    ...overrides,
  };
}

describe("telemetry middleware trace propagation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it(
    "correlates a login response header with structured request log trace data",
    async () => {
    const bcrypt = await import("bcryptjs");
    const db = makeDbChain([]);
    db.limit.mockResolvedValueOnce([
      makeActiveUser({ passwordHash: await bcrypt.hash("pass123", 4) }),
    ]);
    db.returning.mockResolvedValueOnce([makeSession()]);
    db.returning.mockResolvedValueOnce([{ id: "rt-1" }]);

    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const [{ telemetryMiddleware }, { default: authRoutes }] = await Promise.all([
      import("../telemetry"),
      import("../api/routes/auth.routes"),
    ]);

    const app = new Hono();
    app.use("*", telemetryMiddleware());
    app.route("/auth", authRoutes);

    const traceId = "trace-login-123";
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-trace-id": traceId,
      },
      body: JSON.stringify({ email: "alice@example.com", password: "pass123" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-trace-id")).toBe(traceId);
    expect(loggerSpies.info).toHaveBeenCalledWith(
      "HTTP request completed",
      expect.objectContaining({
        method: "POST",
        path: "/auth/login",
        status: 200,
        traceId,
      })
    );
  },
    30_000
  );
});
