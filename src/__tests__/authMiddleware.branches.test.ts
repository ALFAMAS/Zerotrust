import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Auth-flow hot path (B4): auth.middleware.join.test.ts only covers the two
// happy-path DB-join branches. This file drives the remaining branches of
// `authMiddleware` / `optionalAuthMiddleware` — expired/invalid tokens,
// missing/revoked/expired sessions, org policy rejection, concurrent-session
// eviction, and suspended/deleted accounts — since these are exactly the
// checks that stand between an attacker and an authenticated request.

const tokenPayload = {
  sub: "00000000-0000-0000-0000-000000000001",
  email: "alice@example.com",
  sid: "00000000-0000-0000-0000-000000000002",
  jti: "jti-1",
  iat: 1,
  exp: Math.floor(Date.now() / 1000) + 3600,
  aud: "zerotrust",
  scope: ["openid"],
};

const verifyMock = vi.hoisted(() => ({ verifyAccessToken: vi.fn() }));

vi.mock("../config", () => ({
  getConfig: () => ({
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
    security: {
      tokenSecretHex: "a".repeat(64),
      csfleMasterKeyHex: "b".repeat(64),
      csflekeyRotationIntervalDays: 90,
    },
  }),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock("../services/auth/token.service", () => ({
  TokenService: vi.fn().mockImplementation(function TokenService() {
    return {
      init: vi.fn().mockResolvedValue(undefined),
      verifyAccessToken: verifyMock.verifyAccessToken,
    };
  }),
}));

const policyMock = vi.hoisted(() => ({
  getEffectiveSessionPolicy: vi.fn(),
  evaluateSessionPolicy: vi.fn(),
  enforceConcurrentSessionCap: vi.fn(),
}));
vi.mock("../services/auth/sessionPolicy.service", () => policyMock);

const revokeSessionMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../middleware/sessionControl", () => ({ revokeSession: revokeSessionMock }));

const cacheMock = vi.hoisted(() => ({
  user: null as any,
  cacheUserState: vi.fn().mockResolvedValue(undefined),
  getUserCached: vi.fn(async () => cacheMock.user),
}));
vi.mock("../services/auth/userStateCache.service", () => ({
  cacheUserState: cacheMock.cacheUserState,
  getUserCached: cacheMock.getUserCached,
}));

const dbMock = vi.hoisted(() => ({ current: undefined as any }));
vi.mock("../db", () => ({ getDb: () => dbMock.current }));

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: tokenPayload.sid,
    userId: tokenPayload.sub,
    tokenId: tokenPayload.jti,
    deviceFingerprint: {},
    ipAddress: "127.0.0.1",
    country: null,
    userAgent: "vitest",
    expiresAt: new Date(Date.now() + 3_600_000),
    lastActivityAt: new Date(),
    isActive: true,
    revokedAt: null,
    revokedReason: null,
    proofOfPossessionKey: null,
    continuousEvalResult: null,
    anomalyFlags: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: tokenPayload.sub,
    email: "alice@example.com",
    username: null,
    passwordHash: null,
    phone: null,
    displayName: "Alice",
    avatarUrl: null,
    roles: ["user"],
    attributes: {},
    mfa: { totp: { enabled: false, backupCodes: [] }, webauthn: { enabled: false } },
    passkeys: [],
    oauthProviders: [],
    status: "active",
    parentUserId: null,
    subUserIds: [],
    sessionConfig: {},
    lastLoginAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Cache-hit DB shape: authMiddleware only queries `sessionsTable` (no join). */
function makeCacheHitDb(sessionRows: unknown[]) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(async () => sessionRows),
    set: vi.fn().mockReturnThis(),
  };
  return {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    chain,
  };
}

function makeErroringDb() {
  return {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.reject(new Error("connection reset")),
        }),
      }),
    })),
  };
}

async function requestProtected(headers: Record<string, string> = { authorization: "Bearer valid-token" }) {
  const { authMiddleware, initAuthMiddleware } = await import("../middleware/auth");
  await initAuthMiddleware();

  const app = new Hono();
  app.get("/protected", authMiddleware, (c) =>
    c.json({ userId: c.get("user")?.id, sessionId: c.get("session")?.id })
  );

  return app.request("/protected", { headers });
}

async function requestOptional(headers: Record<string, string> = {}) {
  const { optionalAuthMiddleware, initAuthMiddleware } = await import("../middleware/auth");
  await initAuthMiddleware();

  const app = new Hono();
  app.get("/optional", optionalAuthMiddleware, (c) =>
    c.json({ userId: c.get("user")?.id ?? null })
  );

  return app.request("/optional", { headers });
}

describe("authMiddleware — token validation branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    cacheMock.user = null;
    policyMock.getEffectiveSessionPolicy.mockResolvedValue({
      idleTimeoutSeconds: 3600,
      maxConcurrentSessions: 0,
    });
    policyMock.evaluateSessionPolicy.mockReturnValue({ allowed: true });
    policyMock.enforceConcurrentSessionCap.mockResolvedValue(false);
  });

  it("rejects a request with no Authorization header", async () => {
    const res = await requestProtected({});
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "TOKEN_INVALID" });
  });

  it("rejects a non-Bearer Authorization header", async () => {
    const res = await requestProtected({ authorization: "Basic xyz" });
    expect(res.status).toBe(401);
  });

  it("returns TOKEN_EXPIRED for an expired access token", async () => {
    verifyMock.verifyAccessToken.mockRejectedValue(new Error("TOKEN_EXPIRED"));
    const res = await requestProtected();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "TOKEN_EXPIRED" });
  });

  it("returns TOKEN_INVALID for a tampered/invalid access token", async () => {
    verifyMock.verifyAccessToken.mockRejectedValue(new Error("bad signature"));
    const res = await requestProtected();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "TOKEN_INVALID" });
  });
});

describe("authMiddleware — session state branches (cache hit)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    verifyMock.verifyAccessToken.mockResolvedValue(tokenPayload);
    cacheMock.user = makeUser();
    policyMock.getEffectiveSessionPolicy.mockResolvedValue({
      idleTimeoutSeconds: 3600,
      maxConcurrentSessions: 0,
    });
    policyMock.evaluateSessionPolicy.mockReturnValue({ allowed: true });
    policyMock.enforceConcurrentSessionCap.mockResolvedValue(false);
  });

  it("returns SESSION_NOT_FOUND when no active session row matches", async () => {
    dbMock.current = makeCacheHitDb([]);
    const res = await requestProtected();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "SESSION_NOT_FOUND" });
  });

  it("returns SERVICE_UNAVAILABLE when the session lookup throws", async () => {
    dbMock.current = makeErroringDb();
    const res = await requestProtected();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "SERVICE_UNAVAILABLE" });
  });

  it("expires a past-due session and rejects the request", async () => {
    const expired = makeSession({ expiresAt: new Date(Date.now() - 1000) });
    dbMock.current = makeCacheHitDb([{ session: expired }]);
    const res = await requestProtected();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "SESSION_EXPIRED" });
    expect(dbMock.current.chain.set).toHaveBeenCalledWith({ isActive: false });
  });

  it("rejects an explicitly revoked session", async () => {
    const revoked = makeSession({ revokedAt: new Date() });
    dbMock.current = makeCacheHitDb([{ session: revoked }]);
    const res = await requestProtected();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "TOKEN_REVOKED" });
  });

  it("rejects and revokes a session that violates org policy", async () => {
    dbMock.current = makeCacheHitDb([{ session: makeSession() }]);
    policyMock.evaluateSessionPolicy.mockReturnValue({
      allowed: false,
      reason: "IDLE_TIMEOUT_EXCEEDED",
    });
    const res = await requestProtected();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "IDLE_TIMEOUT_EXCEEDED" });
    expect(revokeSessionMock).toHaveBeenCalledWith(tokenPayload.sid, "IDLE_TIMEOUT_EXCEEDED");
  });

  it("rejects when the concurrent-session cap evicts this session", async () => {
    dbMock.current = makeCacheHitDb([{ session: makeSession() }]);
    policyMock.getEffectiveSessionPolicy.mockResolvedValue({
      idleTimeoutSeconds: 3600,
      maxConcurrentSessions: 3,
    });
    policyMock.enforceConcurrentSessionCap.mockResolvedValue(true);
    const res = await requestProtected();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "SESSION_CONCURRENT_LIMIT" });
  });

  it("rejects a deleted user account", async () => {
    dbMock.current = makeCacheHitDb([{ session: makeSession() }]);
    cacheMock.user = makeUser({ status: "deleted" });
    const res = await requestProtected();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "USER_DELETED" });
  });

  it("rejects a suspended user account with 403", async () => {
    dbMock.current = makeCacheHitDb([{ session: makeSession() }]);
    cacheMock.user = makeUser({ status: "suspended" });
    const res = await requestProtected();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "USER_SUSPENDED" });
  });

  it("allows the request through and sets user/session context on success", async () => {
    dbMock.current = makeCacheHitDb([{ session: makeSession() }]);
    const res = await requestProtected();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: tokenPayload.sub, sessionId: tokenPayload.sid });
  });
});

describe("optionalAuthMiddleware", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    cacheMock.user = null;
  });

  it("passes through anonymously with no Authorization header", async () => {
    const res = await requestOptional({});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: null });
  });

  it("passes through anonymously when the token fails verification", async () => {
    verifyMock.verifyAccessToken.mockRejectedValue(new Error("bad token"));
    const res = await requestOptional({ authorization: "Bearer bad" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: null });
  });

  it("passes through anonymously when the session lookup DB errors", async () => {
    verifyMock.verifyAccessToken.mockResolvedValue(tokenPayload);
    dbMock.current = makeErroringDb();
    const res = await requestOptional({ authorization: "Bearer valid-token" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: null });
  });

  it("sets the user when a valid session and active user are found", async () => {
    verifyMock.verifyAccessToken.mockResolvedValue(tokenPayload);
    const sessionChain: any = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [makeSession()]),
    };
    const userChain: any = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [makeUser()]),
    };
    let call = 0;
    dbMock.current = {
      select: vi.fn(() => (call++ === 0 ? sessionChain : userChain)),
    };

    const res = await requestOptional({ authorization: "Bearer valid-token" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: tokenPayload.sub });
  });
});
