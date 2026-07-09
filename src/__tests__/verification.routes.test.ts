import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashTokenSha256 } from "../shared/cryptoHash";

// ── Mocks ──────────────────────────────────────────────────────────────────
// verification.routes.ts imports with explicit `.js` specifiers (nodenext), so
// the mock specifier strings must match the source strings verbatim.

vi.mock("../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../logger/index.js", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../crypto/codes.js", () => ({
  generateNumericCode: () => "654321",
}));

vi.mock("../services/notifications/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/shared/saasSettings.service.js", () => ({
  getSettings: vi.fn().mockResolvedValue({
    appUrl: "http://localhost:3000",
    appName: "zerotrust",
  }),
}));

// continuousVerification uses a module-level Map; mock it so we control state
// deterministically instead of leaking store entries across tests.
const recordVerification = vi.fn();
const getVerification = vi.fn().mockReturnValue(null);
vi.mock("../middleware/continuousVerification.js", () => ({
  recordVerification: (...args: unknown[]) => recordVerification(...args),
  getVerification: (...args: unknown[]) => getVerification(...args),
}));

// otpauth exports classes; the route does `new TOTP(...).validate(...)`.
// A known-good token of "111111" validates, everything else fails.
vi.mock("otpauth", () => ({
  TOTP: class {
    validate({ token }: { token: string; window?: number }) {
      return token === "111111" ? 0 : null;
    }
  },
  Secret: { fromBase32: (s: string) => s },
}));

// @simplewebauthn/server: mock the two functions the route pulls in dynamically.
const generateAuthenticationOptions = vi
  .fn()
  .mockResolvedValue({ challenge: "test-challenge", allowCredentials: [] });
const verifyAuthenticationResponse = vi.fn();
vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: (...a: unknown[]) => generateAuthenticationOptions(...a),
  verifyAuthenticationResponse: (...a: unknown[]) => verifyAuthenticationResponse(...a),
}));

// Auth stub: `x-test-user-id` header authenticates and populates user + session.
// verification.routes.ts reads BOTH c.get("user") and c.get("session").
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const TEST_SESSION_ID = "00000000-0000-0000-0000-0000000000ff";
let testUser: Record<string, unknown>;
vi.mock("../middleware/auth.js", () => ({
  authMiddleware: async (c: any, next: any) => {
    const uid = c.req.header("x-test-user-id");
    if (!uid) {
      return c.json({ error: "TOKEN_INVALID", message: "unauthenticated" }, 401);
    }
    c.set("user", testUser);
    c.set("session", { id: TEST_SESSION_ID, userId: uid });
    return next();
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDbChain() {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  // update/delete resolve when awaited after .where()
  chain.where.mockImplementation(() => chain);
  return chain;
}

async function getApp() {
  const { default: router } = await import("../api/routes/verification.routes");
  return new Hono().route("/", router);
}

function req(app: Hono, path: string, body: unknown, authed = true) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authed) headers["x-test-user-id"] = TEST_USER_ID;
  return app.request(path, {
    method: path === "/status" ? "GET" : "POST",
    headers,
    body: path === "/status" ? undefined : JSON.stringify(body),
  });
}

const PASSKEY = {
  credentialId: "cred-abc",
  publicKey: Buffer.from("pub").toString("base64url"),
  counter: 0,
  transports: ["internal"],
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("verification.routes", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    testUser = {
      id: TEST_USER_ID,
      email: "alice@example.com",
      displayName: "Alice",
      passkeys: [],
      mfa: { totp: { enabled: false, backupCodes: [] }, webauthn: { enabled: false } },
    };
    db = makeDbChain();
    const { getDb } = await import("../db/index.js");
    vi.mocked(getDb).mockReturnValue(db as any);
    getVerification.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /challenge", () => {
    it("401 when unauthenticated", async () => {
      const app = await getApp();
      const res = await req(app, "/challenge", { type: "totp" }, false);
      expect(res.status).toBe(401);
    });

    it("defaults to totp challenge", async () => {
      const app = await getApp();
      const res = await req(app, "/challenge", {});
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ type: "totp" });
    });

    it("passkey challenge with no passkeys → 400 NO_PASSKEYS", async () => {
      const app = await getApp();
      const res = await req(app, "/challenge", { type: "passkey" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("NO_PASSKEYS");
    });

    it("passkey challenge with passkeys → 200 options", async () => {
      testUser.passkeys = [PASSKEY];
      const app = await getApp();
      const res = await req(app, "/challenge", { type: "passkey" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe("passkey");
      expect(body.options.challenge).toBe("test-challenge");
      expect(generateAuthenticationOptions).toHaveBeenCalled();
    });

    it("otp challenge sends email and stores code", async () => {
      const app = await getApp();
      const res = await req(app, "/challenge", { type: "otp" });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ type: "otp", channel: "email" });
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe("POST /respond", () => {
    it("401 when unauthenticated", async () => {
      const app = await getApp();
      const res = await req(app, "/respond", { type: "totp", code: "111111" }, false);
      expect(res.status).toBe(401);
    });

    it("totp with no code → 400", async () => {
      const app = await getApp();
      const res = await req(app, "/respond", { type: "totp" });
      expect(res.status).toBe(400);
    });

    it("totp when not enabled → 400 TOTP_NOT_ENABLED", async () => {
      const app = await getApp();
      const res = await req(app, "/respond", { type: "totp", code: "111111" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("TOTP_NOT_ENABLED");
    });

    it("totp invalid code → 401", async () => {
      testUser.mfa = { totp: { enabled: true, secret: "SECRET", backupCodes: [] } };
      const app = await getApp();
      const res = await req(app, "/respond", { type: "totp", code: "000000" });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("INVALID_CODE");
    });

    it("totp valid code → verified soft", async () => {
      testUser.mfa = { totp: { enabled: true, secret: "SECRET", backupCodes: [] } };
      const app = await getApp();
      const res = await req(app, "/respond", { type: "totp", code: "111111" });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ verified: true, level: "soft" });
      expect(recordVerification).toHaveBeenCalledWith(TEST_SESSION_ID, "soft");
    });

    it("otp with no code → 400", async () => {
      const app = await getApp();
      const res = await req(app, "/respond", { type: "otp" });
      expect(res.status).toBe(400);
    });

    it("otp no matching row → 401 INVALID_CODE", async () => {
      db.limit.mockResolvedValueOnce([]);
      const app = await getApp();
      const res = await req(app, "/respond", { type: "otp", code: "654321" });
      expect(res.status).toBe(401);
    });

    it("otp valid code → verified soft, deletes row", async () => {
      db.limit.mockResolvedValueOnce([{ id: "otp-1", code: hashTokenSha256("654321") }]);
      const app = await getApp();
      const res = await req(app, "/respond", { type: "otp", code: "654321" });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ verified: true, level: "soft" });
      expect(db.delete).toHaveBeenCalled();
      expect(recordVerification).toHaveBeenCalledWith(TEST_SESSION_ID, "soft");
    });

    it("passkey with no stored challenge → 400 CHALLENGE_EXPIRED", async () => {
      testUser.passkeys = [PASSKEY];
      const app = await getApp();
      // no prior /challenge so consumeChallenge returns null
      const res = await req(app, "/respond", {
        type: "passkey",
        response: { id: "cred-abc" },
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("CHALLENGE_EXPIRED");
    });

    it("passkey happy path → verified hard", async () => {
      testUser.passkeys = [PASSKEY];
      verifyAuthenticationResponse.mockResolvedValueOnce({
        verified: true,
        authenticationInfo: { newCounter: 1 },
      });
      const app = await getApp();
      // First establish a challenge via /challenge (same module instance).
      await req(app, "/challenge", { type: "passkey" });
      const res = await req(app, "/respond", {
        type: "passkey",
        response: { id: "cred-abc" },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ verified: true, level: "hard" });
      expect(recordVerification).toHaveBeenCalledWith(TEST_SESSION_ID, "hard");
    });
  });

  describe("GET /status", () => {
    it("401 when unauthenticated", async () => {
      const app = await getApp();
      const res = await req(app, "/status", undefined, false);
      expect(res.status).toBe(401);
    });

    it("no verification → verified:false", async () => {
      getVerification.mockReturnValue(null);
      const app = await getApp();
      const res = await req(app, "/status", undefined);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ verified: false });
    });

    it("existing verification → verified:true with level+timestamps", async () => {
      const now = Date.now();
      getVerification.mockReturnValue({ verifiedAt: now, level: "hard" });
      const app = await getApp();
      const res = await req(app, "/status", undefined);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.verified).toBe(true);
      expect(body.level).toBe("hard");
      expect(body.verifiedAt).toBeTruthy();
      expect(body.expiresAt).toBeTruthy();
    });
  });
});
