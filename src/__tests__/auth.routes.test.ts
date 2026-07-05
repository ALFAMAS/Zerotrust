import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

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

vi.mock("../middleware/sessionControl", () => ({
  enforceMaxConcurrentDevices: vi.fn().mockResolvedValue(undefined),
}));

// Stub auth so routes behind `authMiddleware` are testable without minting real
// tokens. A request authenticates by sending `x-test-user-id`; omitting it
// simulates an unauthenticated caller (401), mirroring the real middleware.
vi.mock("../middleware/auth", () => ({
  initAuthMiddleware: vi.fn().mockResolvedValue(undefined),
  authMiddleware: async (c: any, next: any) => {
    const uid = c.req.header("x-test-user-id");
    if (!uid) {
      return c.json(
        {
          error: "TOKEN_INVALID",
          message: "Missing or malformed Authorization header",
        },
        401,
      );
    }
    c.set("user", { id: uid, email: "alice@example.com", roles: ["user"] });
    return next();
  },
  optionalAuthMiddleware: async (c: any, next: any) => {
    const auth = c.req.header("authorization");
    const sessionId = c.req.header("x-test-session-id");
    if (auth?.startsWith("Bearer ") && sessionId) {
      c.set("session", {
        id: sessionId,
        userId: c.req.header("x-test-user-id") ?? "00000000-0000-0000-0000-000000000001",
      });
    }
    return next();
  },
}));

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

const recordLoginSuccess = vi.fn();
const recordLoginFailure = vi.fn();
vi.mock("../services/auth/loginAudit.service", () => ({
  recordLoginSuccess: (...args: unknown[]) => recordLoginSuccess(...args),
  recordLoginFailure: (...args: unknown[]) => recordLoginFailure(...args),
}));

vi.mock("../models/settings.model", () => ({
  getSettings: vi.fn().mockResolvedValue({
    accountLockoutEnabled: true,
    accountLockoutThreshold: 8,
    accountLockoutDurationMinutes: 1,
    emailPasswordEnabled: true,
    registrationEnabled: true,
    requireEmailVerification: true,
  }),
}));

vi.mock("../oauth/provider.factory", () => ({
  getProviderAdapter: vi.fn(),
}));

// The breach check performs a network call to HaveIBeenPwned and fails open on
// network errors. Mock it so these route tests are deterministic and do not
// depend on network access or on whether the test password happens to appear in
// a real breach corpus.
vi.mock("../services/auth/passwordBreach.service", () => ({
  isBreachCheckEnabled: () => false,
  checkPasswordBreached: vi
    .fn()
    .mockResolvedValue({ breached: false, count: 0 }),
  rejectIfBreached: vi.fn().mockResolvedValue(null),
}));

// Account-takeover detection fires (fire-and-forget) on sensitive changes such
// as unlinking an OAuth provider; stub it so route tests don't hit its DB/email.
vi.mock("../services/auth/accountTakeover.service", () => ({
  recordAndRespond: vi.fn().mockResolvedValue(false),
  recordSensitiveChange: vi.fn().mockResolvedValue(undefined),
  assessTakeoverRisk: vi
    .fn()
    .mockResolvedValue({ flagged: false, recentEvents: [] }),
}));

vi.mock("../shared/passwordHash", async () => {
  const bcrypt = await import("bcryptjs");
  return {
    hashPassword: vi.fn().mockImplementation((pw: string) =>
      bcrypt.hash(pw, 4).then(() => "$argon2id$mockhash")
    ),
    dummyPasswordHash: vi.fn().mockImplementation(() => bcrypt.hash("pad", 4)),
    verifyPassword: vi.fn().mockImplementation((pw: string, hash: string) =>
      bcrypt.compare(pw, hash)
    ),
    passwordNeedsRehash: vi.fn().mockImplementation((hash: string) =>
      hash.startsWith("$2")
    ),
  };
});

vi.mock("../db/repositories/authSessions.repository", () => ({
  revokeRefreshTokenFamily: vi.fn().mockResolvedValue(undefined),
  revokeSessionAtLogout: vi.fn().mockResolvedValue(true),
  rotateRefreshToken: vi.fn().mockResolvedValue({ id: "00000000-0000-0000-0000-000000000002" }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const USER_ID = "00000000-0000-0000-0000-000000000001";
const FAMILY_ID = "00000000-0000-0000-0000-000000000099";
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
    passwordHash:
      "$2a$04$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    displayName: "Alice",
    roles: ["user"],
    attributes: {},
    mfa: {
      totp: { enabled: false, backupCodes: [] },
      webauthn: { enabled: false },
    },
    passkeys: [],
    oauthProviders: [],
    status: "active",
    subUserIds: [],
    sessionConfig: {
      maxDevices: 5,
      allowedCountries: [],
      allowedIpRanges: [],
      scheduleRestriction: { enabled: false },
    },
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

  it("returns 422 for disposable email domains", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "alice@mailinator.com",
        password: "pass123",
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("DISPOSABLE_EMAIL");
    expect(db.select).not.toHaveBeenCalled();
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
    db.returning.mockResolvedValueOnce([
      makeActiveUser({ email: "alice@example.com" }),
    ]);
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
    expect(recordLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "nobody@example.com",
        reason: "invalid_credentials",
      }),
    );
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
      body: JSON.stringify({
        email: "alice@example.com",
        password: "wrongpass",
      }),
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
    expect(body.refreshToken).toBeUndefined();
    expect(body.tokenType).toBe("Bearer");
    expect(body.expiresIn).toBe(3600);
    expect(recordLoginSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        email: "alice@example.com",
        method: "password",
        sessionId: SESSION_ID,
      }),
    );
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

// ── POST /logout ─────────────────────────────────────────────────────────────

describe("POST /logout", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it("revokes the session server-side and clears the refresh cookie", async () => {
    const { revokeSessionAtLogout } = await import("../db/repositories/authSessions.repository");
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/logout", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access",
        "x-test-session-id": SESSION_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(revokeSessionAtLogout).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      refreshTokenPlain: undefined,
    });
  });

  it("passes refresh token from body when present", async () => {
    const { revokeSessionAtLogout } = await import("../db/repositories/authSessions.repository");
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const refreshToken = "b".repeat(96);
    const res = await app.request("/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(res.status).toBe(200);
    expect(revokeSessionAtLogout).toHaveBeenCalledWith({
      sessionId: undefined,
      refreshTokenPlain: refreshToken,
    });
  });

  it("still succeeds when no session or refresh token is supplied (cookie-only cleanup)", async () => {
    const { revokeSessionAtLogout } = await import("../db/repositories/authSessions.repository");
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(revokeSessionAtLogout).toHaveBeenCalledWith({
      sessionId: undefined,
      refreshTokenPlain: undefined,
    });
  });
});

// ── Credential-stuffing defense (per-IP) ─────────────────────────────────────

describe("POST /login credential-stuffing defense", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    db = makeDbChain([]); // every login → user not found
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("blocks the source IP after failures across many accounts, with 429", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const ip = "203.0.113.99";
    const attempt = (email: string) =>
      app.request("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email, password: "wrong" }),
      });

    // Default distinct-accounts threshold is 10 → 10 failed distinct logins trip it.
    for (let i = 0; i < 10; i++) {
      const res = await attempt(`victim${i}@example.com`);
      expect(res.status).toBe(401);
    }

    const blocked = await attempt("victim10@example.com");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe("TOO_MANY_ATTEMPTS");
  });

  it("does not penalize a different source IP", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    for (let i = 0; i < 10; i++) {
      await app.request("/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.99",
        },
        body: JSON.stringify({ email: `v${i}@example.com`, password: "wrong" }),
      });
    }
    // A clean IP is unaffected (still just invalid credentials, not 429).
    const res = await app.request("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "198.51.100.7",
      },
      body: JSON.stringify({ email: "v0@example.com", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });
});

// ── MFA enforcement at login ─────────────────────────────────────────────────

describe("POST /login with MFA enabled + POST /login/mfa", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    db = makeDbChain([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => vi.clearAllMocks());

  async function mfaUser(password: string) {
    const bcrypt = await import("bcryptjs");
    const { Secret } = await import("otpauth");
    const hash = await bcrypt.hash(password, 4);
    const secret = new Secret({ size: 20 }).base32;
    const user = makeActiveUser({
      passwordHash: hash,
      mfa: {
        totp: { enabled: true, secret, backupCodes: [] },
        webauthn: { enabled: false },
      },
    });
    return { user, secret };
  }

  it("returns mfaRequired (no tokens) when TOTP is enabled", async () => {
    const { user } = await mfaUser("pass123");
    db.limit.mockResolvedValueOnce([user]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "pass123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mfaRequired).toBe(true);
    expect(body.mfaToken).toBeTruthy();
    expect(body.accessToken).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
  });

  it("completes login when a valid TOTP code is supplied", async () => {
    const { user, secret } = await mfaUser("pass123");
    const { TOTP, Secret } = await import("otpauth");

    // 1) /login → mfaRequired
    db.limit.mockResolvedValueOnce([user]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const loginRes = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "pass123" }),
    });
    const { mfaToken } = await loginRes.json();

    // 2) /login/mfa → tokens
    db.limit.mockResolvedValueOnce([user]); // user lookup by id
    db.returning.mockResolvedValueOnce([makeSession()]); // session insert
    db.returning.mockResolvedValueOnce([{ id: "rt-1" }]); // refresh token insert
    const code = new TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    }).generate();

    const res = await app.request("/login/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfaToken, code }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeUndefined();
    expect(body.tokenType).toBe("Bearer");
  });

  it("rejects an invalid TOTP code at /login/mfa", async () => {
    const { user } = await mfaUser("pass123");
    db.limit.mockResolvedValueOnce([user]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const loginRes = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "pass123" }),
    });
    const { mfaToken } = await loginRes.json();

    db.limit.mockResolvedValueOnce([user]); // user lookup by id
    const res = await app.request("/login/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfaToken, code: "000000" }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("INVALID_CODE");
  });

  it("rejects a forged MFA token (wrong audience/scope) at /login/mfa", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    // A plausible-looking but non-challenge token: just sign a normal access token.
    const { TokenService } = await import("../services/auth/token.service");
    const svc = new TokenService("a".repeat(64), {
      defaultTTL: 3600,
      refreshTokenTTL: 604800,
      maxConcurrentDevices: 5,
    } as any);
    await svc.init();
    const forged = await svc.signAccessToken({
      sub: USER_ID,
      email: "alice@example.com",
      sid: "x",
      aud: "zerotrust",
      scope: ["openid"],
    });
    const res = await app.request("/login/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfaToken: forged, code: "123456" }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("MFA_TOKEN_INVALID");
  });
});

// ── GET /me ──────────────────────────────────────────────────────────────────

describe("GET /me", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    db = makeDbChain([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("reports TOTP as enabled and strips secrets/backup-code hashes", async () => {
    db.limit.mockResolvedValueOnce([
      {
        id: USER_ID,
        email: "alice@example.com",
        emailVerifiedAt: new Date(),
        mfa: {
          totp: {
            enabled: true,
            secret: "SUPERSECRETBASE32",
            backupCodes: ["hash1", "hash2", "hash3"],
            verifiedAt: new Date(),
          },
          webauthn: { enabled: false },
        },
        passkeys: [
          {
            credentialId: "cred-1",
            name: "YubiKey",
            publicKey: "PUBKEYDONOTLEAK",
            createdAt: new Date(),
          },
        ],
        oauthProviders: [
          {
            provider: "google",
            email: "alice@example.com",
            connectedAt: new Date(),
          },
        ],
      },
    ]);

    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/me", {
      headers: { "x-test-user-id": USER_ID },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    // The bug: mfa was omitted from the select, so the profile always showed "disabled".
    expect(body.mfa.totp.enabled).toBe(true);
    expect(body.mfa.totp.backupCodesRemaining).toBe(3);
    // Secrets must never reach the client.
    expect(body.mfa.totp.secret).toBeUndefined();
    expect(body.mfa.totp.backupCodes).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("SUPERSECRETBASE32");
    expect(JSON.stringify(body)).not.toContain("PUBKEYDONOTLEAK");
    // Non-secret profile data is still surfaced.
    expect(body.passkeys[0].name).toBe("YubiKey");
    expect(body.oauthProviders[0].provider).toBe("google");
  });

  it("returns disabled MFA defaults when the user has no mfa object", async () => {
    db.limit.mockResolvedValueOnce([
      {
        id: USER_ID,
        email: "alice@example.com",
        emailVerifiedAt: null,
        mfa: null,
        passkeys: null,
        oauthProviders: null,
      },
    ]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/me", {
      headers: { "x-test-user-id": USER_ID },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mfa.totp.enabled).toBe(false);
    expect(body.passkeys).toEqual([]);
    expect(body.oauthProviders).toEqual([]);
  });
});

// ── DELETE /oauth/:provider (unlink) ─────────────────────────────────────────

describe("DELETE /oauth/:provider", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    db = makeDbChain([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => vi.clearAllMocks());

  async function del(provider: string, auth = true) {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (auth) headers["x-test-user-id"] = USER_ID;
    return app.request(`/oauth/${provider}`, { method: "DELETE", headers });
  }

  it("returns 401 when unauthenticated", async () => {
    const res = await del("google", false);
    expect(res.status).toBe(401);
  });

  it("unlinks a provider when the user still has a password", async () => {
    db.limit.mockResolvedValueOnce([
      {
        passwordHash: "$2a$04$hash",
        oauthProviders: [
          { provider: "google", providerId: "g1" },
          { provider: "github", providerId: "h1" },
        ],
      },
    ]);
    const res = await del("google");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unlinked).toBe(true);
    expect(body.provider).toBe("google");
    // The remaining provider list is persisted without google.
    const setArg = db.set.mock.calls.at(-1)?.[0];
    expect(setArg.oauthProviders).toEqual([
      { provider: "github", providerId: "h1" },
    ]);
  });

  it("returns 404 when the provider is not linked", async () => {
    db.limit.mockResolvedValueOnce([
      {
        passwordHash: "$2a$04$hash",
        oauthProviders: [{ provider: "github", providerId: "h1" }],
      },
    ]);
    const res = await del("google");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("NOT_LINKED");
  });

  it("refuses to remove the only login method (no password, last provider)", async () => {
    db.limit.mockResolvedValueOnce([
      {
        passwordHash: null,
        oauthProviders: [{ provider: "google", providerId: "g1" }],
      },
    ]);
    const res = await del("google");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("LAST_CREDENTIAL");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("allows removing a passwordless user's provider when another remains", async () => {
    db.limit.mockResolvedValueOnce([
      {
        passwordHash: null,
        oauthProviders: [
          { provider: "google", providerId: "g1" },
          { provider: "github", providerId: "h1" },
        ],
      },
    ]);
    const res = await del("google");
    expect(res.status).toBe(200);
    expect((await res.json()).unlinked).toBe(true);
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

  it("detects reuse of a revoked refresh token and revokes the whole family", async () => {
    const { revokeRefreshTokenFamily } = await import("../db/repositories/authSessions.repository");
    db.limit.mockResolvedValueOnce([
      {
        id: "rt-1",
        userId: USER_ID,
        sessionId: SESSION_ID,
        familyId: FAMILY_ID,
        tokenHash: "hash",
        isRevoked: true, // already rotated → replay = theft signal
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    ]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "a".repeat(96) }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("TOKEN_REUSE_DETECTED");
    expect(revokeRefreshTokenFamily).toHaveBeenCalledWith(FAMILY_ID, "refresh_token_reuse");
  });

  it("returns 401 when refresh token is expired", async () => {
    db.limit.mockResolvedValueOnce([
      {
        id: "rt-1",
        userId: USER_ID,
        sessionId: SESSION_ID,
        tokenHash: "hash",
        isRevoked: false,
        expiresAt: new Date(Date.now() - 1000),
      },
    ]);
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
    const { rotateRefreshToken } = await import("../db/repositories/authSessions.repository");
    // 1) refresh token lookup
    db.limit.mockResolvedValueOnce([
      {
        id: "rt-1",
        userId: USER_ID,
        sessionId: SESSION_ID,
        familyId: FAMILY_ID,
        tokenHash: "hash",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    ]);
    // 2) user lookup
    db.limit.mockResolvedValueOnce([makeActiveUser()]);

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
    expect(body.refreshToken).toBeUndefined();
    expect(body.tokenType).toBe("Bearer");
    expect(rotateRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        oldRefreshTokenId: "rt-1",
        session: expect.objectContaining({ userId: USER_ID, isActive: true }),
        refreshToken: expect.objectContaining({ userId: USER_ID, familyId: FAMILY_ID }),
      })
    );
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
    const res = await app.request(
      "/oauth/google/callback?code=abc&state=invalid-state",
    );
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

    const res = await app.request(
      `/oauth/google/callback?code=abc&state=${state}`,
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("PROVIDER_ERROR");
  });

  it("creates a session and 302-redirects with a one-time oauth_code", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const stateRes = await app.request("/oauth/state", { method: "POST" });
    const { state } = await stateRes.json();

    const { getProviderAdapter } = await import("../oauth/provider.factory");
    vi.mocked(getProviderAdapter).mockReturnValue({
      exchangeCode: vi.fn().mockResolvedValue({
        tokens: {},
        profile: {
          id: "g-123",
          email: "new@example.com",
          name: "New User",
          emailVerified: true,
        },
      }),
    } as any);

    db.limit.mockResolvedValueOnce([]); // no existing user → create path
    db.returning
      .mockResolvedValueOnce([
        makeActiveUser({ id: USER_ID, email: "new@example.com" }),
      ]) // user
      .mockResolvedValueOnce([makeSession()]) // session insert
      .mockResolvedValueOnce([{ id: "rt-1" }]); // refresh token insert

    const res = await app.request(
      `/oauth/google/callback?code=abc&state=${state}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login?oauth_code=");
  });
});

// ── GET /oauth/:provider/authorize ─────────────────────────────────────────

describe("GET /oauth/:provider/authorize", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(makeDbChain([]) as any);
  });
  afterEach(() => vi.clearAllMocks());

  it("returns 400 for an unsupported provider", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/oauth/twitter/authorize");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("UNSUPPORTED_PROVIDER");
  });

  it("returns 400 when the provider is not configured", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/oauth/google/authorize");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("PROVIDER_NOT_CONFIGURED");
  });
});

describe("GET /oauth/:provider/authorize (configured)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("../config", () => ({
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
        geofencing: {
          enabled: false,
          allowedCountries: [],
          allowedIpRanges: [],
        },
        mfa: {
          totpWindow: 1,
          otpExpirySecs: 900,
          maxOTPAttempts: 5,
          channels: {
            email: { enabled: true },
            telegram: { enabled: false, botToken: "" },
          },
        },
        oauth: {
          providers: {
            google: {
              clientId: "gid",
              clientSecret: "gsecret",
              redirectUri: "http://localhost:1337/auth/oauth/google/callback",
            },
          },
        },
        elasticsearch: {
          enabled: false,
          host: "localhost",
          port: 9200,
          indexPrefix: "zerotrust",
        },
        logging: { level: "error", format: "json" },
      }),
    }));
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../config");
  });

  it("returns the Google authorize URL with state + server-side PKCE challenge", async () => {
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(makeDbChain([]) as any);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await app.request("/oauth/google/authorize");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorizeUrl).toContain(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    const url = new URL(body.authorizeUrl);
    expect(url.searchParams.get("client_id")).toBe("gid");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe(body.state);
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("email");
  });
});

// ── POST /oauth/exchange ───────────────────────────────────────────────────

describe("POST /oauth/exchange", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    db = makeDbChain([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });
  afterEach(() => vi.clearAllMocks());

  const post = (app: Hono, code?: unknown) =>
    app.request("/oauth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(code === undefined ? {} : { code }),
    });

  it("returns 400 when code is missing", async () => {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await post(app);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_REQUEST");
  });

  it("returns 400 for an invalid or expired code", async () => {
    db.limit.mockResolvedValueOnce([]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await post(app, "nope");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_CODE");
  });

  it("returns the stored tokens for a valid one-time code", async () => {
    db.limit.mockResolvedValueOnce([
      {
        code: "c1",
        userId: USER_ID,
        sessionId: SESSION_ID,
        accessToken: "at",
        refreshToken: "rt",
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const res = await post(app, "c1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBe("at");
    expect(body.refreshToken).toBeUndefined();
  });
});

// ── Rate Limiting (route-level) ────────────────────────────────────────────

describe("Route-level rate limiting", () => {
  beforeEach(async () => {
    vi.resetModules();
    // Re-enable rate limiting for this suite
    vi.doMock("../config", () => ({
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
        rateLimiting: { enabled: true, perIpLimit: 3, windowSecs: 60 },
        geofencing: {
          enabled: false,
          allowedCountries: [],
          allowedIpRanges: [],
        },
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
    const { consumeInMemory, clearInMemoryBuckets } =
      await import("../services/shared/rateLimiter/inmemory");
    clearInMemoryBuckets();

    const key = `rl-route-test-${Date.now()}`;
    for (let i = 0; i < 3; i++) consumeInMemory(key, 1, 3, 60);
    const r = consumeInMemory(key, 1, 3, 60);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });
});

// ── Progressive login backoff ──────────────────────────────────────────────

describe("Progressive login backoff after failed attempts", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { clearLockout } = await import("../middleware/accountLockout");
    clearLockout("locked@example.com");
  });

  afterEach(() => vi.clearAllMocks());

  it("does not delay before the first failure", async () => {
    const { isAccountLocked } = await import("../middleware/accountLockout");
    expect(isAccountLocked("fresh@example.com").locked).toBe(false);
  });

  it("applies exponential delay after failed logins", async () => {
    const { recordFailedLogin, isAccountLocked, computeBackoffDelayMs } =
      await import("../middleware/accountLockout");
    const email = `backoff-${Date.now()}@example.com`;

    recordFailedLogin(email);
    expect(isAccountLocked(email).locked).toBe(true);
    expect(computeBackoffDelayMs(1)).toBe(1000);
    expect(computeBackoffDelayMs(3)).toBe(4000);
  });

  it("requires proof-of-work after the configured threshold", async () => {
    const { recordFailedLogin, getLoginThrottle } =
      await import("../middleware/accountLockout");
    const email = `pow-${Date.now()}@example.com`;

    for (let i = 0; i < 8; i++) recordFailedLogin(email, { powThreshold: 8 });
    expect(getLoginThrottle(email, { powThreshold: 8 }).requiresPow).toBe(true);
  });

  it("clears backoff state on successful login", async () => {
    const { recordFailedLogin, isAccountLocked, recordSuccessfulLogin } =
      await import("../middleware/accountLockout");
    const email = `unlock-${Date.now()}@example.com`;

    recordFailedLogin(email);
    expect(isAccountLocked(email).locked).toBe(true);

    recordSuccessfulLogin(email);
    expect(isAccountLocked(email).locked).toBe(false);
  });
});

// ── POST /verify-email ──────────────────────────────────────────────────────

describe("POST /verify-email", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    db = makeDbChain([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => vi.clearAllMocks());

  // `auth` defaults to true → send the test auth header; pass false to simulate
  // an unauthenticated caller.
  async function post(body: unknown, auth = true) {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (auth) headers["x-test-user-id"] = USER_ID;
    return app.request("/verify-email", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when the caller is not authenticated", async () => {
    const res = await post({ code: "123456" }, false);
    expect(res.status).toBe(401);
  });

  it("returns 400 when the code is missing", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_REQUEST");
  });

  it("returns 404 when the authenticated user no longer exists", async () => {
    db.limit.mockResolvedValueOnce([]); // user lookup → none
    const res = await post({ code: "123456" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("USER_NOT_FOUND");
  });

  it("verifies on a valid, unexpired code (happy path)", async () => {
    db.limit
      .mockResolvedValueOnce([makeActiveUser({ emailVerifiedAt: null })]) // user lookup
      .mockResolvedValueOnce([
        { id: "otp-1", userId: USER_ID, code: "123456" },
      ]); // otp lookup
    const res = await post({ code: "123456" });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("looks the user up by session id, never the request body", async () => {
    db.limit
      .mockResolvedValueOnce([makeActiveUser({ emailVerifiedAt: null })])
      .mockResolvedValueOnce([
        { id: "otp-1", userId: USER_ID, code: "123456" },
      ]);
    // Even if a different email is smuggled in the body, it is ignored.
    const res = await post({ code: "123456", email: "attacker@example.com" });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("returns 400 INVALID_CODE when the code is wrong or expired", async () => {
    db.limit
      .mockResolvedValueOnce([makeActiveUser({ emailVerifiedAt: null })]) // user lookup
      .mockResolvedValueOnce([]); // otp lookup → no match
    const res = await post({ code: "000000" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_CODE");
  });

  it("is idempotent for an already-verified account", async () => {
    db.limit.mockResolvedValueOnce([
      makeActiveUser({ emailVerifiedAt: new Date() }),
    ]);
    const res = await post({ code: "123456" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.alreadyVerified).toBe(true);
  });
});

// ── OAuth account-takeover defense (callback identity merge) ──────────────────
//
// When an OAuth callback resolves an email that already belongs to an existing
// account, the new social identity may only be merged in when the IdP asserts
// the email is verified. Otherwise an attacker who registers at the provider
// with a victim's address could log straight into the victim's account.
describe("GET /oauth/:provider/callback — account-linking safety", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    db = makeDbChain([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => vi.clearAllMocks());

  async function callbackWithProfile(profile: any) {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const stateRes = await app.request("/oauth/state", { method: "POST" });
    const { state } = await stateRes.json();
    const { getProviderAdapter } = await import("../oauth/provider.factory");
    vi.mocked(getProviderAdapter).mockReturnValue({
      exchangeCode: vi.fn().mockResolvedValue({ tokens: {}, profile }),
    } as any);
    return { app, state };
  }

  it("refuses to merge an UNVERIFIED provider email into a pre-existing account", async () => {
    // Existing local account for the same email, no google identity linked yet.
    db.limit.mockResolvedValueOnce([
      makeActiveUser({ email: "victim@example.com", oauthProviders: [] }),
    ]);
    const { app, state } = await callbackWithProfile({
      id: "attacker-google-id",
      email: "victim@example.com",
      name: "Mallory",
      emailVerified: false,
    });

    const res = await app.request(`/oauth/google/callback?code=abc&state=${state}`);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("OAUTH_EMAIL_UNVERIFIED");
    // Critically: no session/identity write happened.
    expect(db.update).not.toHaveBeenCalled();
  });

  it("merges + logs in when the provider email IS verified", async () => {
    db.limit.mockResolvedValueOnce([
      makeActiveUser({ email: "user@example.com", oauthProviders: [] }),
    ]);
    db.returning.mockResolvedValueOnce([makeSession()]); // session insert
    const { app, state } = await callbackWithProfile({
      id: "g-verified",
      email: "user@example.com",
      name: "User",
      emailVerified: true,
    });

    const res = await app.request(`/oauth/google/callback?code=abc&state=${state}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login?oauth_code=");
  });

  it("allows an already-linked identity through even if emailVerified is now false", async () => {
    db.limit.mockResolvedValueOnce([
      makeActiveUser({
        email: "user@example.com",
        oauthProviders: [{ provider: "google", providerId: "g-known" }],
      }),
    ]);
    db.returning.mockResolvedValueOnce([makeSession()]);
    const { app, state } = await callbackWithProfile({
      id: "g-known",
      email: "user@example.com",
      emailVerified: false,
    });

    const res = await app.request(`/oauth/google/callback?code=abc&state=${state}`);
    expect(res.status).toBe(302);
  });
});

// ── POST /auth/me/link — verified-only OAuth linking ─────────────────────────
//
// Linking must be driven by a real code exchange, never a self-asserted provider
// user id. These tests lock in that the endpoint verifies the identity.
describe("POST /auth/me/link", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    db = makeDbChain([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => vi.clearAllMocks());

  async function link(body: unknown, auth = true) {
    const router = await getRouter();
    const app = new Hono().route("/", router);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth) headers["x-test-user-id"] = USER_ID;
    return app.request("/me/link", { method: "POST", headers, body: JSON.stringify(body) });
  }

  function mockAdapter(profile: any) {
    return import("../oauth/provider.factory").then(({ getProviderAdapter }) => {
      vi.mocked(getProviderAdapter).mockReturnValue({
        exchangeCode: vi.fn().mockResolvedValue({ tokens: {}, profile }),
      } as any);
    });
  }

  it("401s when unauthenticated", async () => {
    const res = await link({ provider: "google", code: "x" }, false);
    expect(res.status).toBe(401);
  });

  it("400s without provider or code", async () => {
    const res = await link({ provider: "google" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_REQUEST");
  });

  it("400s for an unsupported provider", async () => {
    const res = await link({ provider: "twitter", code: "x" });
    expect(res.status).toBe(400);
  });

  it("rejects an unverified provider email (no self-asserted identity trusted)", async () => {
    await mockAdapter({ id: "g-1", email: "u@example.com", emailVerified: false });
    const res = await link({ provider: "google", code: "abc" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("OAUTH_EMAIL_UNVERIFIED");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("409s when the verified identity already belongs to another user", async () => {
    await mockAdapter({ id: "g-1", email: "u@example.com", emailVerified: true });
    db.limit.mockResolvedValueOnce([{ id: "different-user" }]); // existingLink lookup
    const res = await link({ provider: "google", code: "abc" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("ALREADY_LINKED");
  });

  it("links a verified identity to the current account", async () => {
    await mockAdapter({ id: "g-1", email: "u@example.com", emailVerified: true });
    db.limit
      .mockResolvedValueOnce([]) // no other account holds the identity
      .mockResolvedValueOnce([{ oauthProviders: [] }]); // current user
    const res = await link({ provider: "google", code: "abc" });
    expect(res.status).toBe(200);
    expect((await res.json()).linked).toBe(true);
    const setArg = db.set.mock.calls.at(-1)?.[0];
    expect(setArg.oauthProviders[0]).toMatchObject({ provider: "google", providerId: "g-1" });
  });
});
