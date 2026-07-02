import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
// passkey.routes.ts uses EXTENSIONLESS specifiers (../../db, ../../config, ...).

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../config", () => ({
  getConfig: () => ({
    security: { tokenSecretHex: "a".repeat(64) },
    session: { defaultTTL: 3600, refreshTokenTTL: 604800 },
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

const getSettings = vi.fn();
vi.mock("../models/settings.model", () => ({
  getSettings: (...a: unknown[]) => getSettings(...a),
}));

const getOrgSecurityPolicy = vi.fn();
const toAttestationPolicy = vi.fn((p: unknown) => p);
vi.mock("../services/auth/orgSecurityPolicy.service", () => ({
  getOrgSecurityPolicy: (...a: unknown[]) => getOrgSecurityPolicy(...a),
  toAttestationPolicy: (...a: unknown[]) => toAttestationPolicy(...a),
}));

const verifyAttestation = vi.fn(() => ({ passed: true }));
vi.mock("../mfa/attestation", () => ({
  KNOWN_HARDWARE_KEY_AAGUIDS: {} as Record<string, unknown>,
  verifyAttestation: (...a: unknown[]) => verifyAttestation(...a),
}));

vi.mock("../shared/clientIp", () => ({
  getClientIp: () => "127.0.0.1",
}));

// TokenService is instantiated lazily inside the route (new + init()).
const signAccessToken = vi.fn().mockResolvedValue("access-token-xyz");
const verifyAccessToken = vi
  .fn()
  .mockResolvedValue({ jti: "jti-1", exp: Math.floor(Date.now() / 1000) + 3600 });
const signRefreshToken = vi.fn().mockResolvedValue("refresh-token-abc");
vi.mock("../services/auth/token.service", () => ({
  TokenService: class {
    init = vi.fn().mockResolvedValue(undefined);
    signAccessToken = signAccessToken;
    verifyAccessToken = verifyAccessToken;
    signRefreshToken = signRefreshToken;
  },
}));

// @simplewebauthn/server: all four ceremony functions.
const generateRegistrationOptions = vi
  .fn()
  .mockResolvedValue({ challenge: "reg-challenge", user: {} });
const verifyRegistrationResponse = vi.fn();
const generateAuthenticationOptions = vi
  .fn()
  .mockResolvedValue({ challenge: "auth-challenge", allowCredentials: [] });
const verifyAuthenticationResponse = vi.fn();
vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: (...a: unknown[]) => generateRegistrationOptions(...a),
  verifyRegistrationResponse: (...a: unknown[]) => verifyRegistrationResponse(...a),
  generateAuthenticationOptions: (...a: unknown[]) => generateAuthenticationOptions(...a),
  verifyAuthenticationResponse: (...a: unknown[]) => verifyAuthenticationResponse(...a),
}));

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
let testUser: Record<string, unknown>;
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    const uid = c.req.header("x-test-user-id");
    if (!uid) {
      return c.json({ error: "TOKEN_INVALID", message: "unauthenticated" }, 401);
    }
    c.set("user", testUser);
    return next();
  },
}));

// ── DB chain ────────────────────────────────────────────────────────────────
// The authenticate/verify path does `await db.select().from(usersTable)` with no
// terminal `.where()/.limit()`, mapping over all users — so the chain itself must
// be awaitable (thenable), resolving to `selectAllResult`. `.limit()` still
// resolves scalar selects, and `.returning()` resolves inserts.

function makeDbChain() {
  const state = {
    selectAllResult: [] as unknown[],
    limitResult: [] as unknown[],
    returningResult: [{ id: "session-1" }] as unknown[],
  };
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(() => Promise.resolve(state.limitResult)),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(() => Promise.resolve(state.returningResult)),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    // Make `await db.select().from(x)` (and any awaited chain) resolve to the
    // "all users" result. `.limit()`/`.returning()` return their own promises
    // above, so those paths are unaffected.
    then: (resolve: (v: unknown) => void) => resolve(state.selectAllResult),
    __state: state,
  };
  chain.where.mockImplementation(() => chain);
  chain.values.mockImplementation(() => chain);
  return chain;
}

async function getApp() {
  const { default: router } = await import("../api/routes/passkey.routes");
  return new Hono().route("/", router);
}

function post(app: Hono, path: string, body: unknown, authed = false) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authed) headers["x-test-user-id"] = TEST_USER_ID;
  return app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
}

const PASSKEY = {
  credentialId: "cred-abc",
  publicKey: Buffer.from("pub").toString("base64url"),
  counter: 3,
  transports: ["internal"],
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("passkey.routes", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    testUser = {
      id: TEST_USER_ID,
      email: "alice@example.com",
      displayName: "Alice",
      passkeys: [],
    };
    getSettings.mockResolvedValue({
      passkeyEnabled: true,
      appName: "zerotrust",
      appUrl: "http://localhost:3000",
    });
    getOrgSecurityPolicy.mockResolvedValue(null);
    db = makeDbChain();
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /register/options", () => {
    it("401 when unauthenticated", async () => {
      const app = await getApp();
      const res = await post(app, "/register/options", {}, false);
      expect(res.status).toBe(401);
    });

    it("403 FEATURE_DISABLED when passkeys disabled", async () => {
      getSettings.mockResolvedValue({ passkeyEnabled: false });
      const app = await getApp();
      const res = await post(app, "/register/options", {}, true);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("FEATURE_DISABLED");
    });

    it("200 returns registration options and stores challenge", async () => {
      const app = await getApp();
      const res = await post(app, "/register/options", {}, true);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.challenge).toBe("reg-challenge");
      expect(generateRegistrationOptions).toHaveBeenCalled();
    });
  });

  describe("POST /register/verify", () => {
    it("401 when unauthenticated", async () => {
      const app = await getApp();
      const res = await post(app, "/register/verify", { id: "x" }, false);
      expect(res.status).toBe(401);
    });

    it("403 when passkeys disabled", async () => {
      getSettings.mockResolvedValue({ passkeyEnabled: false });
      const app = await getApp();
      const res = await post(app, "/register/verify", { id: "x" }, true);
      expect(res.status).toBe(403);
    });

    it("400 CHALLENGE_EXPIRED when no prior options", async () => {
      const app = await getApp();
      const res = await post(app, "/register/verify", { id: "x" }, true);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("CHALLENGE_EXPIRED");
    });

    it("400 VERIFICATION_FAILED when verifier throws", async () => {
      verifyRegistrationResponse.mockRejectedValueOnce(new Error("bad"));
      const app = await getApp();
      await post(app, "/register/options", {}, true); // establish challenge
      const res = await post(app, "/register/verify", { id: "x" }, true);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("VERIFICATION_FAILED");
    });

    it("400 VERIFICATION_FAILED when not verified", async () => {
      verifyRegistrationResponse.mockResolvedValueOnce({ verified: false });
      const app = await getApp();
      await post(app, "/register/options", {}, true);
      const res = await post(app, "/register/verify", { id: "x" }, true);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("VERIFICATION_FAILED");
    });

    it("200 appends passkey and enables webauthn on success", async () => {
      verifyRegistrationResponse.mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credential: { id: "cred-new", publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
          credentialDeviceType: "singleDevice",
          credentialBackedUp: false,
          fmt: "none",
        },
      });
      db.__state.limitResult = [{ passkeys: [], mfa: null }];
      const app = await getApp();
      await post(app, "/register/options", {}, true);
      const res = await post(app, "/register/verify", { id: "cred-new", name: "Yubi" }, true);
      expect(res.status).toBe(200);
      expect((await res.json()).verified).toBe(true);
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe("POST /authenticate/options", () => {
    it("403 when passkeys disabled", async () => {
      getSettings.mockResolvedValue({ passkeyEnabled: false });
      const app = await getApp();
      const res = await post(app, "/authenticate/options", {});
      expect(res.status).toBe(403);
    });

    it("200 returns options + challengeKey (no email)", async () => {
      const app = await getApp();
      const res = await post(app, "/authenticate/options", {});
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.challenge).toBe("auth-challenge");
      expect(body._challengeKey).toBeTruthy();
      expect(generateAuthenticationOptions).toHaveBeenCalled();
    });

    it("200 with email looks up user passkeys for allowCredentials", async () => {
      db.__state.limitResult = [{ passkeys: [PASSKEY] }];
      const app = await getApp();
      const res = await post(app, "/authenticate/options", { email: "alice@example.com" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body._challengeKey).toBe("alice@example.com");
    });
  });

  describe("POST /authenticate/verify", () => {
    it("403 when passkeys disabled", async () => {
      getSettings.mockResolvedValue({ passkeyEnabled: false });
      const app = await getApp();
      const res = await post(app, "/authenticate/verify", { id: "cred-abc" });
      expect(res.status).toBe(403);
    });

    it("400 when no key (email/challengeKey) provided", async () => {
      const app = await getApp();
      const res = await post(app, "/authenticate/verify", { id: "cred-abc" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("INVALID_REQUEST");
    });

    it("400 CHALLENGE_EXPIRED when challenge not stored", async () => {
      const app = await getApp();
      const res = await post(app, "/authenticate/verify", {
        id: "cred-abc",
        email: "alice@example.com",
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("CHALLENGE_EXPIRED");
    });

    it("401 PASSKEY_NOT_FOUND when no user owns the credential", async () => {
      db.__state.selectAllResult = []; // no users
      const app = await getApp();
      await post(app, "/authenticate/options", { email: "alice@example.com" });
      const res = await post(app, "/authenticate/verify", {
        id: "unknown-cred",
        email: "alice@example.com",
      });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("PASSKEY_NOT_FOUND");
    });

    it("happy path mints tokens, inserts session + refresh token", async () => {
      db.__state.selectAllResult = [
        { id: TEST_USER_ID, email: "alice@example.com", passkeys: [PASSKEY] },
      ];
      db.__state.returningResult = [{ id: "session-1" }];
      verifyAuthenticationResponse.mockResolvedValueOnce({
        verified: true,
        authenticationInfo: { newCounter: 4 },
      });
      const app = await getApp();
      await post(app, "/authenticate/options", { email: "alice@example.com" });
      const res = await post(app, "/authenticate/verify", {
        id: "cred-abc",
        email: "alice@example.com",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accessToken).toBe("access-token-xyz");
      expect(body.refreshToken).toBe("refresh-token-abc");
      expect(body.tokenType).toBe("Bearer");
      expect(signAccessToken).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled(); // counter update
      // session insert + refresh token insert
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it("401 VERIFICATION_FAILED when verifier reports not verified", async () => {
      db.__state.selectAllResult = [
        { id: TEST_USER_ID, email: "alice@example.com", passkeys: [PASSKEY] },
      ];
      verifyAuthenticationResponse.mockResolvedValueOnce({ verified: false });
      const app = await getApp();
      await post(app, "/authenticate/options", { email: "alice@example.com" });
      const res = await post(app, "/authenticate/verify", {
        id: "cred-abc",
        email: "alice@example.com",
      });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("VERIFICATION_FAILED");
    });
  });
});
