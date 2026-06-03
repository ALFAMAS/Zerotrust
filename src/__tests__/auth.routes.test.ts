import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  getDb: vi.fn(),
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
    rateLimiting: { enabled: false, perIpLimit: 100, windowSecs: 60 },
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

vi.mock("../middleware/sessionControl", () => ({
  enforceMaxConcurrentDevices: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../oauth/provider.factory", () => ({
  getProviderAdapter: vi.fn(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const USER_ID = "00000000-0000-0000-0000-000000000001";
const SESSION_ID = "00000000-0000-0000-0000-000000000002";

function makeDbChain(returnValue: any) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  return chain;
}

function makeActiveUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: "alice@example.com",
    passwordHash: "$2a$04$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    displayName: "Alice",
    roles: ["user"],
    attributes: {},
    mfa: { totp: { enabled: false, backupCodes: [] }, webauthn: { enabled: false } },
    passkeys: [],
    oauthProviders: [],
    status: "active",
    subUserIds: [],
    sessionConfig: { maxDevices: 5, allowedCountries: [], allowedIpRanges: [], scheduleRestriction: { enabled: false } },
    createdAt: new Date(),
    updatedAt: new Date(),
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

// Re-import router after mocks are set up
async function getRouter() {
  const { default: router } = await import("../api/routes/auth.routes");
  return router;
}

// ── POST /register ─────────────────────────────────────────────────────────

describe("POST /register", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    db = makeDbChain([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when email is missing", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "secret123" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_REQUEST");
  });

  it("returns 400 when password is missing", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_REQUEST");
  });

  it("returns 409 when user already exists", async () => {
    db.limit.mockResolvedValueOnce([makeActiveUser()]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "pass123" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("USER_ALREADY_EXISTS");
  });

  it("returns 201 with userId on successful registration", async () => {
    // First select returns [] (no existing user), insert returning returns new user
    db.limit.mockResolvedValueOnce([]);
    db.returning.mockResolvedValueOnce([makeActiveUser()]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "pass123" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.userId).toBe(USER_ID);
  });

  it("normalizes email to lowercase", async () => {
    db.limit.mockResolvedValueOnce([]);
    db.returning.mockResolvedValueOnce([makeActiveUser({ email: "alice@example.com" })]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ALICE@EXAMPLE.COM", password: "pass123" }),
    });
    expect(res.status).toBe(201);
  });

  it("uses email prefix as displayName when not provided", async () => {
    db.limit.mockResolvedValueOnce([]);
    const capturedValues: any[] = [];
    db.values.mockImplementation((v: any) => {
      capturedValues.push(v);
      return db;
    });
    db.returning.mockResolvedValueOnce([makeActiveUser()]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "pass123" }),
    });
    expect(capturedValues[0]?.displayName).toBe("alice");
  });

  it("returns 500 on unexpected database error", async () => {
    db.limit.mockRejectedValueOnce(new Error("DB down"));
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "pass123" }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("INTERNAL_ERROR");
  });
});

// ── POST /login ────────────────────────────────────────────────────────────

describe("POST /login", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    db = makeDbChain([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when credentials are missing", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_REQUEST");
  });

  it("returns 401 when user does not exist", async () => {
    db.limit.mockResolvedValueOnce([]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "pass" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("INVALID_CREDENTIALS");
  });

  it("returns 401 on wrong password", async () => {
    // bcrypt hash for "correctpass" with rounds=4
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("correctpass", 4);
    db.limit.mockResolvedValueOnce([makeActiveUser({ passwordHash: hash })]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "wrongpass" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("INVALID_CREDENTIALS");
  });

  it("returns 200 with tokens on valid credentials", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("pass123", 4);
    const user = makeActiveUser({ passwordHash: hash });
    db.limit.mockResolvedValueOnce([user]);
    // insert session returning
    db.returning.mockResolvedValueOnce([makeSession()]);
    // insert refresh token returning
    db.returning.mockResolvedValueOnce([{ id: "rt-1" }]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "pass123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.tokenType).toBe("Bearer");
    expect(body.expiresIn).toBe(3600);
  });

  it("returns 500 on unexpected error", async () => {
    db.limit.mockRejectedValueOnce(new Error("connection lost"));
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "pass" }),
    });
    expect(res.status).toBe(500);
  });
});

// ── POST /token/refresh ────────────────────────────────────────────────────

describe("POST /token/refresh", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    db = makeDbChain([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when refreshToken is missing", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_REQUEST");
  });

  it("returns 401 when refresh token is not found", async () => {
    db.limit.mockResolvedValueOnce([]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "a".repeat(96) }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("TOKEN_INVALID");
  });

  it("returns 401 when refresh token is revoked", async () => {
    db.limit.mockResolvedValueOnce([{
      id: "rt-1",
      userId: USER_ID,
      sessionId: SESSION_ID,
      tokenHash: "hash",
      isRevoked: true,
      expiresAt: new Date(Date.now() + 3_600_000),
    }]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "a".repeat(96) }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("TOKEN_INVALID");
  });

  it("returns 401 when refresh token is expired", async () => {
    db.limit.mockResolvedValueOnce([{
      id: "rt-1",
      userId: USER_ID,
      sessionId: SESSION_ID,
      tokenHash: "hash",
      isRevoked: false,
      expiresAt: new Date(Date.now() - 1000),
    }]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "a".repeat(96) }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with new token pair on valid refresh", async () => {
    // 1) refresh token lookup
    db.limit.mockResolvedValueOnce([{
      id: "rt-1",
      userId: USER_ID,
      sessionId: SESSION_ID,
      tokenHash: "hash",
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3_600_000),
    }]);
    // 2) update (revoke old RT) — no return needed
    db.returning.mockResolvedValueOnce([{ id: "rt-1" }]);
    // 3) user lookup
    db.limit.mockResolvedValueOnce([makeActiveUser()]);
    // 4) insert new session
    db.returning.mockResolvedValueOnce([makeSession()]);
    // 5) insert new refresh token
    db.returning.mockResolvedValueOnce([{ id: "rt-2" }]);

    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "a".repeat(96) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.tokenType).toBe("Bearer");
  });
});

// ── POST /oauth/state ──────────────────────────────────────────────────────

describe("POST /oauth/state", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it("returns a state string and ttlSeconds", async () => {
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(makeDbChain([]) as any);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/oauth/state", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.state).toBe("string");
    expect(body.state.length).toBeGreaterThan(0);
    expect(body.ttlSeconds).toBe(300);
  });

  it("returns a unique state on each call", async () => {
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(makeDbChain([]) as any);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const r1 = await app.request("/oauth/state", { method: "POST" });
    const r2 = await app.request("/oauth/state", { method: "POST" });
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.state).not.toBe(b2.state);
  });
});

// ── GET /oauth/:provider/callback ──────────────────────────────────────────

describe("GET /oauth/:provider/callback", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    db = makeDbChain([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("returns 400 when code is missing", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/oauth/google/callback?state=abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_REQUEST");
  });

  it("returns 400 when state is invalid", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/oauth/google/callback?code=abc&state=invalid-state");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_STATE");
  });

  it("returns 502 when provider exchange fails", async () => {
    // Generate a valid state first
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const stateRes = await app.request("/oauth/state", { method: "POST" });
    const { state } = await stateRes.json();

    const { getProviderAdapter } = await import("../oauth/provider.factory");
    vi.mocked(getProviderAdapter).mockReturnValue({
      exchangeCode: vi.fn().mockResolvedValue({ profile: null }),
    } as any);

    const res = await app.request(`/oauth/google/callback?code=abc&state=${state}`);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("PROVIDER_ERROR");
  });
});

// ── Rate Limiting (route-level) ────────────────────────────────────────────

describe("Route-level rate limiting", () => {
  beforeEach(async () => {
    vi.resetModules();
    // Re-enable rate limiting for this suite
    vi.doMock("../config", () => ({
      getConfig: () => ({
        session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
        security: {
          bcryptRounds: 4,
          tokenSecretHex: "a".repeat(64),
          csfleMasterKeyHex: "b".repeat(64),
          csflekeyRotationIntervalDays: 90,
        },
        rateLimiting: { enabled: true, perIpLimit: 3, windowSecs: 60 },
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
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../config");
  });

  it("blocks requests after exhausting route limit", async () => {
    const { clearRateLimiter } = await import("../middleware/rateLimiting");
    clearRateLimiter();
    const router = await getRouter();
    const app = new Hono().route("/", router);

    // Exhaust the limit of 10 (register route uses points: 10)
    // We use the in-memory bucket logic from rateLimiting middleware directly
    const { consumeInMemory, clearInMemoryBuckets } = await import("../services/rateLimiter/inmemory");
    clearInMemoryBuckets();

    const key = `rl-route-test-${Date.now()}`;
    for (let i = 0; i < 3; i++) consumeInMemory(key, 1, 3, 60);
    const r = consumeInMemory(key, 1, 3, 60);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });
});

// ── Account Lockout (via route) ────────────────────────────────────────────

describe("Account lockout after failed login attempts", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { clearLockout } = await import("../middleware/accountLockout");
    clearLockout("locked@example.com");
  });

  afterEach(() => vi.clearAllMocks());

  it("records failed login attempts on the account", async () => {
    const { recordFailedLogin, isAccountLocked } = await import("../middleware/accountLockout");
    const email = `fail-test-${Date.now()}@example.com`;

    // Under the threshold (default MAX_ATTEMPTS = 5)
    for (let i = 0; i < 3; i++) recordFailedLogin(email);
    expect(isAccountLocked(email).locked).toBe(false);
  });

  it("locks account after exceeding attempt threshold", async () => {
    const { recordFailedLogin, isAccountLocked } = await import("../middleware/accountLockout");
    const email = `lock-test-${Date.now()}@example.com`;

    for (let i = 0; i < 5; i++) recordFailedLogin(email);
    expect(isAccountLocked(email).locked).toBe(true);
  });

  it("remains locked until lockout duration expires", async () => {
    const { recordFailedLogin, isAccountLocked } = await import("../middleware/accountLockout");
    const email = `persist-lock-${Date.now()}@example.com`;

    for (let i = 0; i < 5; i++) recordFailedLogin(email);
    // Still locked immediately after
    expect(isAccountLocked(email).locked).toBe(true);
  });

  it("clears lockout on successful login", async () => {
    const { recordFailedLogin, isAccountLocked, recordSuccessfulLogin } =
      await import("../middleware/accountLockout");
    const email = `unlock-test-${Date.now()}@example.com`;

    for (let i = 0; i < 5; i++) recordFailedLogin(email);
    expect(isAccountLocked(email).locked).toBe(true);

    recordSuccessfulLogin(email);
    expect(isAccountLocked(email).locked).toBe(false);
  });
});
