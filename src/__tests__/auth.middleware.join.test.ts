import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const cacheMock = vi.hoisted(() => ({
  user: null as any,
  cacheUserState: vi.fn().mockResolvedValue(undefined),
  getUserCached: vi.fn(async () => cacheMock.user),
}));

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

vi.mock("../services/token.service", () => ({
  TokenService: vi.fn().mockImplementation(function TokenService() {
    return {
      init: vi.fn().mockResolvedValue(undefined),
      verifyAccessToken: vi.fn().mockResolvedValue(tokenPayload),
    };
  }),
}));

vi.mock("../services/sessionPolicy.service", () => ({
  getEffectiveSessionPolicy: vi.fn().mockResolvedValue({
    idleTimeoutSeconds: 3600,
    maxConcurrentSessions: 0,
  }),
  evaluateSessionPolicy: vi.fn().mockReturnValue({ allowed: true }),
  enforceConcurrentSessionCap: vi.fn().mockResolvedValue(false),
}));

vi.mock("../middleware/sessionControl", () => ({
  revokeSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/userStateCache.service", () => ({
  cacheUserState: cacheMock.cacheUserState,
  getUserCached: cacheMock.getUserCached,
}));

const dbMock = vi.hoisted(() => ({ current: undefined as any }));
vi.mock("../db", () => ({ getDb: () => dbMock.current }));

function makeSession() {
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
  };
}

function makeUser() {
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
  };
}

function makeDb() {
  let joined = false;
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn(() => {
      joined = true;
      return chain;
    }),
    limit: vi.fn(async () => {
      if (joined) return [{ session: makeSession(), user: makeUser() }];
      return [{ session: makeSession() }];
    }),
    set: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  };
  return {
    chain,
    select: vi.fn(() => chain),
    update: chain.update,
  };
}

async function requestProtected() {
  const { authMiddleware, initAuthMiddleware } = await import("../middleware/auth");
  await initAuthMiddleware();

  const app = new Hono();
  app.get("/protected", authMiddleware, (c) =>
    c.json({ userId: c.get("user")?.id, sessionId: c.get("session")?.id })
  );

  return app.request("/protected", {
    headers: { authorization: "Bearer valid-token" },
  });
}

describe("authMiddleware DB hot path", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    cacheMock.user = null;
  });

  it("loads active session and user with one joined select on cache miss", async () => {
    const db = makeDb();
    dbMock.current = db;

    const res = await requestProtected();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: tokenPayload.sub, sessionId: tokenPayload.sid });
    expect(cacheMock.getUserCached).toHaveBeenCalledWith(tokenPayload.sub);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.chain.innerJoin).toHaveBeenCalledTimes(1);
    expect(cacheMock.cacheUserState).toHaveBeenCalledWith(expect.objectContaining({ id: tokenPayload.sub }));
  });

  it("uses cached user state and avoids the session+user join on cache hit", async () => {
    cacheMock.user = makeUser();
    const db = makeDb();
    dbMock.current = db;

    const res = await requestProtected();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: tokenPayload.sub, sessionId: tokenPayload.sid });
    expect(cacheMock.getUserCached).toHaveBeenCalledWith(tokenPayload.sub);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.chain.innerJoin).not.toHaveBeenCalled();
    expect(cacheMock.cacheUserState).not.toHaveBeenCalled();
  });
});
