import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
// password-reset.routes.ts imports with EXTENSIONLESS specifiers
// (../../db, ../../mfa, ...), so mock specifier strings here must be
// extensionless too (../db, ../mfa, ...).

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../config", () => ({
  getConfig: () => ({
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
    security: { bcryptRounds: 4, tokenSecretHex: "a".repeat(64), csfleMasterKeyHex: "b".repeat(64) },
    rateLimiting: { enabled: false, perIpLimit: 100, windowSecs: 60 },
    geofencing: { enabled: false, allowedCountries: [], allowedIpRanges: [] },
    mfa: {
      totpWindow: 1,
      otpExpirySecs: 900,
      maxOTPAttempts: 5,
      channels: { email: { enabled: true } },
    },
    oauth: { providers: {} },
    elasticsearch: { enabled: false, host: "localhost", port: 9200, indexPrefix: "zerotrust" },
    logging: { level: "error", format: "json" },
  }),
}));

const sendOTP = vi.fn().mockResolvedValue(true);
vi.mock("../mfa", () => ({
  sendOTP: (...a: unknown[]) => sendOTP(...a),
}));

const sendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/notifications/email.service", () => ({
  sendPasswordResetEmail: (...a: unknown[]) => sendPasswordResetEmail(...a),
}));

const rejectIfBreached = vi.fn().mockResolvedValue(null);
vi.mock("../services/auth/passwordBreach.service", () => ({
  rejectIfBreached: (...a: unknown[]) => rejectIfBreached(...a),
}));

const recordAndRespond = vi.fn().mockResolvedValue(false);
vi.mock("../services/auth/accountTakeover.service", () => ({
  recordAndRespond: (...a: unknown[]) => recordAndRespond(...a),
}));

const revokeAllSessionsForUser = vi.fn().mockResolvedValue(undefined);
vi.mock("../middleware/sessionControl", () => ({
  revokeAllSessionsForUser: (...a: unknown[]) => revokeAllSessionsForUser(...a),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const USER_ID = "00000000-0000-0000-0000-000000000001";
const USER_EMAIL = "alice@example.com";

function makeOtpRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "otp-1",
    userId: USER_ID,
    code: "123456",
    type: "password_reset",
    channel: "email",
    target: USER_EMAIL,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    usedAt: null,
    attempts: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

/** Builds a chainable Drizzle-like mock. `limit` resolves the next queued
 * result array; `set`/`values`/`delete` are recorded for assertions. */
function makeDb(userRows: unknown[], otpRows: unknown[]) {
  const updateCalls: Array<{ table: string; set: unknown }> = [];
  const deleteCalls: string[] = [];
  let selectCallIndex = 0;
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation(function (this: any, table: unknown) {
      this.__table = table;
      return this;
    }),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(function (this: any) {
      // First select() call in each handler is always the user lookup;
      // second (if reached) is the OTP lookup.
      const result = selectCallIndex === 0 ? userRows : otpRows;
      selectCallIndex++;
      return Promise.resolve(result);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockImplementation(function (this: any, table: unknown) {
      this.__updateTable = table === usersTableRef ? "users" : "otps";
      return this;
    }),
    set: vi.fn().mockImplementation(function (this: any, values: unknown) {
      updateCalls.push({ table: this.__updateTable, set: values });
      return this;
    }),
    delete: vi.fn().mockImplementation(function (this: any, table: unknown) {
      deleteCalls.push(table === usersTableRef ? "users" : "otps");
      return this;
    }),
  };
  return { chain, updateCalls, deleteCalls };
}

// Populated once ../db/schema is imported inside the route module; kept as a
// shared reference so makeDb() can tell users vs otps table updates/deletes
// apart without re-implementing schema comparisons.
let usersTableRef: unknown;

async function getApp() {
  const schema = await import("../db/schema");
  usersTableRef = schema.usersTable;
  const { default: router } = await import("../api/routes/password-reset.routes");
  return new Hono().route("/", router);
}

function post(app: Hono, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("password-reset.routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sendOTP.mockResolvedValue(true);
    sendPasswordResetEmail.mockResolvedValue(undefined);
    rejectIfBreached.mockResolvedValue(null);
    recordAndRespond.mockResolvedValue(false);
    revokeAllSessionsForUser.mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  describe("POST /request", () => {
    it("returns { sent: true } silently for an unknown email (no enumeration)", async () => {
      const { getDb } = await import("../db");
      const { chain } = makeDb([], []);
      vi.mocked(getDb).mockReturnValue(chain);

      const app = await getApp();
      const res = await post(app, "/request", { email: "nobody@example.com" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ sent: true });
      expect(sendOTP).not.toHaveBeenCalled();
    });

    it("issues a fresh OTP and deletes any previously pending ones", async () => {
      const { getDb } = await import("../db");
      const { chain } = makeDb(
        [{ id: USER_ID, email: USER_EMAIL, displayName: "Alice" }],
        []
      );
      vi.mocked(getDb).mockReturnValue(chain);

      const app = await getApp();
      const res = await post(app, "/request", { email: USER_EMAIL });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ sent: true });

      // Old pending OTPs are cleared before the new one is inserted.
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.insert).toHaveBeenCalled();
      expect(sendOTP).toHaveBeenCalledWith("email", USER_EMAIL, expect.any(String));
    });
  });

  describe("POST /confirm", () => {
    it("400s with a generic message when no OTP is pending", async () => {
      const { getDb } = await import("../db");
      const { chain } = makeDb(
        [{ id: USER_ID, email: USER_EMAIL, displayName: "Alice" }],
        []
      );
      vi.mocked(getDb).mockReturnValue(chain);

      const app = await getApp();
      const res = await post(app, "/confirm", {
        email: USER_EMAIL,
        code: "000000",
        newPassword: "Str0ng!Passw0rd",
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe("Invalid or expired reset code");
    });

    it("increments the attempt counter on a wrong code instead of leaving it untouched", async () => {
      const { getDb } = await import("../db");
      const otp = makeOtpRow({ code: "123456", attempts: 0 });
      const { chain, updateCalls } = makeDb(
        [{ id: USER_ID, email: USER_EMAIL, displayName: "Alice" }],
        [otp]
      );
      vi.mocked(getDb).mockReturnValue(chain);

      const app = await getApp();
      const res = await post(app, "/confirm", {
        email: USER_EMAIL,
        code: "999999", // wrong
        newPassword: "Str0ng!Passw0rd",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe("Invalid or expired reset code");

      // attempts must have been bumped via an UPDATE on the otps row — this
      // is the exact gap the finding called out (attempts column existed
      // but was never read or incremented).
      const otpUpdate = updateCalls.find((u) => u.table === "otps");
      expect(otpUpdate).toBeDefined();

      // Password must NOT have been changed on a failed guess.
      const usersUpdate = updateCalls.find((u) => u.table === "users");
      expect(usersUpdate).toBeUndefined();
    });

    it("burns the OTP once attempts reach the configured max (lockout)", async () => {
      const { getDb } = await import("../db");
      // maxOTPAttempts is mocked to 5 — a row already at 5 must be rejected
      // and deleted rather than compared against.
      const otp = makeOtpRow({ code: "123456", attempts: 5 });
      const { chain, deleteCalls } = makeDb(
        [{ id: USER_ID, email: USER_EMAIL, displayName: "Alice" }],
        [otp]
      );
      vi.mocked(getDb).mockReturnValue(chain);

      const app = await getApp();
      // Even the CORRECT code must be rejected once the row is locked out.
      const res = await post(app, "/confirm", {
        email: USER_EMAIL,
        code: "123456",
        newPassword: "Str0ng!Passw0rd",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe("Invalid or expired reset code");
      expect(deleteCalls).toContain("otps");
    });

    it("resets the password, deletes the OTP, and revokes all sessions on a correct code", async () => {
      const { getDb } = await import("../db");
      const otp = makeOtpRow({ code: "654321", attempts: 2 });
      const { chain, updateCalls, deleteCalls } = makeDb(
        [{ id: USER_ID, email: USER_EMAIL, displayName: "Alice" }],
        [otp]
      );
      vi.mocked(getDb).mockReturnValue(chain);

      const app = await getApp();
      const res = await post(app, "/confirm", {
        email: USER_EMAIL,
        code: "654321",
        newPassword: "Str0ng!Passw0rd",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });

      const usersUpdate = updateCalls.find((u) => u.table === "users");
      expect(usersUpdate).toBeDefined();
      expect(deleteCalls).toContain("otps");

      // M12: a successful reset must unconditionally revoke every session,
      // not only when the account-takeover heuristic happens to fire.
      expect(revokeAllSessionsForUser).toHaveBeenCalledWith(USER_ID);
      expect(recordAndRespond).toHaveBeenCalledWith(
        USER_ID,
        "password_reset",
        expect.objectContaining({ email: USER_EMAIL })
      );
    });

    it("rejects a breached new password before touching the user row", async () => {
      rejectIfBreached.mockResolvedValueOnce("This password has appeared in a data breach");

      const { getDb } = await import("../db");
      const otp = makeOtpRow({ code: "111111", attempts: 0 });
      const { chain, updateCalls } = makeDb(
        [{ id: USER_ID, email: USER_EMAIL, displayName: "Alice" }],
        [otp]
      );
      vi.mocked(getDb).mockReturnValue(chain);

      const app = await getApp();
      const res = await post(app, "/confirm", {
        email: USER_EMAIL,
        code: "111111",
        newPassword: "password123",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("PASSWORD_BREACHED");
      expect(updateCalls.find((u) => u.table === "users")).toBeUndefined();
    });
  });

  describe("rate limiting", () => {
    // Exercise the REAL rateLimiting module (not mocked) to confirm the
    // routes actually mount it — this was the core of finding C1: the
    // route previously carried no throttle at all.
    it("mounts a request-level rate limiter on /request", async () => {
      vi.resetModules();
      vi.doMock("../config", () => ({
        getConfig: () => ({
          session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
          security: { bcryptRounds: 4 },
          rateLimiting: { enabled: true, perIpLimit: 100, windowSecs: 60 },
          geofencing: { enabled: false, allowedCountries: [], allowedIpRanges: [] },
          mfa: { totpWindow: 1, otpExpirySecs: 900, maxOTPAttempts: 5, channels: {} },
          oauth: { providers: {} },
          elasticsearch: { enabled: false, host: "localhost", port: 9200, indexPrefix: "zt" },
          logging: { level: "error", format: "json" },
        }),
      }));

      const { getDb } = await import("../db");
      const { chain } = makeDb([], []);
      vi.mocked(getDb).mockReturnValue(chain);

      const { clearRateLimiter } = await import("../middleware/rateLimiting");
      clearRateLimiter();

      const app = await getApp();
      const hit = () =>
        app.request("/request", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
          body: JSON.stringify({ email: "nobody@example.com" }),
        });

      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) {
        const res = await hit();
        statuses.push(res.status);
      }

      // points is 5/hour in the route — the 6th+ request from the same IP
      // must be throttled.
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);

      clearRateLimiter();
    });
  });
});
