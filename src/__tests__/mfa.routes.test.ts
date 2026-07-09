import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashTokenSha256 } from "../../src/shared/cryptoHash";

// Plugin routes import core modules via ../../src/... — mock those specifiers.

vi.mock("../../src/db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../src/logger/index.js", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const sendOTP = vi.fn().mockResolvedValue(true);
vi.mock("../../src/services/auth/otpDelivery.service.js", () => ({
  sendOTP: (...a: unknown[]) => sendOTP(...a),
}));

const sendOtpEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/services/notifications/email.service.js", () => ({
  sendOtpEmail: (...a: unknown[]) => sendOtpEmail(...a),
}));

const getSettings = vi.fn();
vi.mock("../../src/services/shared/saasSettings.service.js", () => ({
  getSettings: (...a: unknown[]) => getSettings(...a),
}));

vi.mock("otpauth", () => ({
  TOTP: class {
    secret = { base32: "TESTSECRETBASE32" };
    validate({ token }: { token: string; window?: number }) {
      return token === "111111" ? 0 : null;
    }
  },
  Secret: class {
    static fromBase32(s: string) {
      return s;
    }
  },
  URI: { stringify: () => "otpauth://totp/zerotrust:alice" },
}));

vi.mock("qrcode", () => ({
  toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,QR"),
}));

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const TEST_SESSION_ID = "00000000-0000-0000-0000-0000000000ff";
let testUser: Record<string, unknown>;
vi.mock("../../src/middleware/auth.js", () => ({
  authMiddleware: async (c: any, next: any) => {
    const uid = c.req.header("x-test-user-id");
    if (!uid) {
      return c.json({ error: "TOKEN_INVALID", message: "unauthenticated" }, 401);
    }
    c.set("user", testUser);
    c.set("session", { id: TEST_SESSION_ID, userId: uid, lastActivityAt: new Date() });
    return next();
  },
}));

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
  chain.where.mockImplementation(() => chain);
  return chain;
}

async function getApp() {
  const { default: router } = await import("../../plugins/mfa/routes");
  return new Hono().route("/", router);
}

function post(app: Hono, path: string, body: unknown, authed = true) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authed) headers["x-test-user-id"] = TEST_USER_ID;
  return app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
}

function del(app: Hono, path: string, authed = true) {
  const headers: Record<string, string> = {};
  if (authed) headers["x-test-user-id"] = TEST_USER_ID;
  return app.request(path, { method: "DELETE", headers });
}

describe("mfa.routes", () => {
  let db: ReturnType<typeof makeDbChain>;

  beforeEach(async () => {
    vi.resetModules();
    testUser = {
      id: TEST_USER_ID,
      email: "alice@example.com",
      displayName: "Alice",
    };
    getSettings.mockResolvedValue({
      totpEnabled: true,
      emailOtpEnabled: true,
      appName: "zerotrust",
      appUrl: "http://localhost:3000",
    });
    db = makeDbChain();
    const { getDb } = await import("../../src/db/index.js");
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /totp/setup", () => {
    it("401 when unauthenticated", async () => {
      const app = await getApp();
      const res = await post(app, "/totp/setup", {}, false);
      expect(res.status).toBe(401);
    });

    it("403 FEATURE_DISABLED when totp disabled", async () => {
      getSettings.mockResolvedValue({ totpEnabled: false });
      const app = await getApp();
      const res = await post(app, "/totp/setup", {});
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("FEATURE_DISABLED");
    });

    it("happy path returns secret + qrCodeUrl and persists secret disabled", async () => {
      db.limit.mockResolvedValueOnce([{ mfa: null }]);
      const app = await getApp();
      const res = await post(app, "/totp/setup", {});
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.secret).toBe("TESTSECRETBASE32");
      expect(body.qrCodeUrl).toBe("data:image/png;base64,QR");
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe("POST /totp/verify", () => {
    it("403 when totp disabled", async () => {
      getSettings.mockResolvedValue({ totpEnabled: false });
      const app = await getApp();
      const res = await post(app, "/totp/verify", { code: "111111" });
      expect(res.status).toBe(403);
    });

    it("400 when code missing", async () => {
      const app = await getApp();
      const res = await post(app, "/totp/verify", {});
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("INVALID_REQUEST");
    });

    it("400 TOTP_NOT_SETUP when no stored secret", async () => {
      db.limit.mockResolvedValueOnce([{ mfa: { totp: { enabled: false } } }]);
      const app = await getApp();
      const res = await post(app, "/totp/verify", { code: "111111" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("TOTP_NOT_SETUP");
    });

    it("401 on invalid code", async () => {
      db.limit.mockResolvedValueOnce([
        { mfa: { totp: { enabled: false, secret: "S", backupCodes: [] } } },
      ]);
      const app = await getApp();
      const res = await post(app, "/totp/verify", { code: "000000" });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("INVALID_CODE");
    });

    it("valid code first-time enables TOTP and returns backup codes", async () => {
      db.limit.mockResolvedValueOnce([
        { mfa: { totp: { enabled: false, secret: "S", backupCodes: [] } } },
      ]);
      const app = await getApp();
      const res = await post(app, "/totp/verify", { code: "111111" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.enabled).toBe(true);
      expect(Array.isArray(body.backupCodes)).toBe(true);
      expect(body.backupCodes).toHaveLength(10);
      expect(db.update).toHaveBeenCalled();
    });

    it("valid code when already enabled does NOT regenerate backup codes", async () => {
      db.limit.mockResolvedValueOnce([
        { mfa: { totp: { enabled: true, secret: "S", backupCodes: ["hash1", "hash2"] } } },
      ]);
      const app = await getApp();
      const res = await post(app, "/totp/verify", { code: "111111" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.enabled).toBe(true);
      expect(body.backupCodes).toBeUndefined();
    });
  });

  describe("DELETE /totp", () => {
    it("401 when unauthenticated", async () => {
      const app = await getApp();
      const res = await del(app, "/totp", false);
      expect(res.status).toBe(401);
    });

    it("requires continuous re-verification before disabling TOTP", async () => {
      const app = await getApp();
      const res = await del(app, "/totp");
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("REVERIFICATION_REQUIRED");
    });

    it("disables TOTP after recent re-verification", async () => {
      const { recordVerification } = await import("../middleware/continuousVerification");
      recordVerification(TEST_SESSION_ID, "soft");
      db.limit.mockResolvedValueOnce([
        { mfa: { totp: { enabled: true, secret: "S", backupCodes: [] } } },
      ]);
      const app = await getApp();
      const res = await del(app, "/totp");
      expect(res.status).toBe(200);
      expect((await res.json()).disabled).toBe(true);
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe("POST /otp/send", () => {
    it("400 when channel is not email", async () => {
      const app = await getApp();
      const res = await post(app, "/otp/send", { channel: "sms" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("INVALID_REQUEST");
    });

    it("403 when email OTP disabled", async () => {
      getSettings.mockResolvedValue({ emailOtpEnabled: false });
      const app = await getApp();
      const res = await post(app, "/otp/send", { channel: "email" });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("FEATURE_DISABLED");
    });

    it("happy path inserts OTP and calls both senders", async () => {
      const app = await getApp();
      const res = await post(app, "/otp/send", { channel: "email" });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ sent: true, channel: "email" });
      expect(db.insert).toHaveBeenCalled();
      expect(sendOTP).toHaveBeenCalledWith("email", "alice@example.com", expect.any(String));
      expect(sendOtpEmail).toHaveBeenCalled();
    });
  });

  describe("POST /otp/verify", () => {
    it("400 when channel or code missing", async () => {
      const app = await getApp();
      const res = await post(app, "/otp/verify", { channel: "email" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("INVALID_REQUEST");
    });

    it("401 when no matching OTP row", async () => {
      db.limit.mockResolvedValueOnce([]);
      const app = await getApp();
      const res = await post(app, "/otp/verify", { channel: "email", code: "123456" });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("INVALID_CODE");
    });

    it("200 and deletes row on match", async () => {
      db.limit.mockResolvedValueOnce([{ id: "otp-1", code: hashTokenSha256("123456") }]);
      const app = await getApp();
      const res = await post(app, "/otp/verify", { channel: "email", code: "123456" });
      expect(res.status).toBe(200);
      expect((await res.json()).verified).toBe(true);
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
