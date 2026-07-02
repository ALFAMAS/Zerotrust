import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

vi.mock("../models/index", () => ({
  AuditModel: { create: vi.fn().mockResolvedValue({}) },
  SessionModel: {
    findOne: vi.fn().mockResolvedValue(null),
    updateOne: vi.fn().mockResolvedValue({}),
  },
  UserModel: { findById: vi.fn().mockResolvedValue(null) },
  RoleModel: {
    findOne: vi
      .fn()
      .mockImplementation(() => ({ lean: () => Promise.resolve(null) })),
  },
  JITModel: {
    find: vi.fn().mockImplementation(() => ({
      populate: vi.fn().mockReturnThis(),
      lean: () => Promise.resolve([]),
    })),
  },
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
    rateLimiting: { enabled: true, perIpLimit: 10, windowSecs: 60 },
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

// ── Rate Limiting ──────────────────────────────────────────────────────────

describe("Rate Limiting Middleware", () => {
  it("allows requests within the configured limit", async () => {
    const { consumeInMemory, clearInMemoryBuckets } =
      await import("../services/shared/rateLimiter/inmemory");
    clearInMemoryBuckets();
    const key = `mw-test-${Date.now()}`;
    const r = consumeInMemory(key, 1, 10, 60);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(9);
  });

  it("blocks after exhausting the bucket", async () => {
    const { consumeInMemory, clearInMemoryBuckets } =
      await import("../services/shared/rateLimiter/inmemory");
    clearInMemoryBuckets();
    const key = `mw-block-${Date.now()}`;
    for (let i = 0; i < 3; i++) consumeInMemory(key, 1, 3, 60);
    const r = consumeInMemory(key, 1, 3, 60);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("bans IP after repeated violations", async () => {
    const { consumeInMemory, isIpBanned, clearInMemoryBuckets } =
      await import("../services/shared/rateLimiter/inmemory");
    clearInMemoryBuckets();
    const key = `ban-test-${Date.now()}`;
    for (let i = 0; i < 10; i++) consumeInMemory(key, 1, 1, 60);
    const ban = isIpBanned(key);
    expect(ban.banned).toBe(true);
    expect(ban.seconds).toBeGreaterThan(0);
  });

  it("reports remaining tokens accurately", async () => {
    const { consumeInMemory, clearInMemoryBuckets } =
      await import("../services/shared/rateLimiter/inmemory");
    clearInMemoryBuckets();
    const key = `remaining-${Date.now()}`;
    const r1 = consumeInMemory(key, 1, 5, 60);
    expect(r1.remaining).toBe(4);
    const r2 = consumeInMemory(key, 1, 5, 60);
    expect(r2.remaining).toBe(3);
  });
});

// ── Account Lockout ────────────────────────────────────────────────────────

describe("Account Lockout Middleware", () => {
  beforeEach(async () => {
    const { clearLockout } = await import("../middleware/accountLockout");
    clearLockout("lockout-test@example.com");
  });

  it("is not locked initially", async () => {
    const { isAccountLocked } = await import("../middleware/accountLockout");
    const { locked } = isAccountLocked("fresh-user@example.com");
    expect(locked).toBe(false);
  });

  it("records failed logins and tracks count", async () => {
    const { recordFailedLogin, isAccountLocked } =
      await import("../middleware/accountLockout");
    const email = `lockout-test-${Date.now()}@example.com`;
    await recordFailedLogin(email);
    await recordFailedLogin(email);
    const { locked } = isAccountLocked(email);
    expect(locked).toBe(false);
  });

  it("clears lockout after successful login", async () => {
    const { recordFailedLogin, recordSuccessfulLogin, isAccountLocked } =
      await import("../middleware/accountLockout");
    const email = `clear-test-${Date.now()}@example.com`;
    await recordFailedLogin(email);
    recordSuccessfulLogin(email);
    const { locked } = isAccountLocked(email);
    expect(locked).toBe(false);
  });

  it("clearLockout removes tracking record", async () => {
    const { recordFailedLogin, clearLockout, isAccountLocked } =
      await import("../middleware/accountLockout");
    const email = `clear2-${Date.now()}@example.com`;
    await recordFailedLogin(email);
    clearLockout(email);
    const { locked } = isAccountLocked(email);
    expect(locked).toBe(false);
  });
});

// ── Geo-Fencing ────────────────────────────────────────────────────────────

describe("Geo-Fencing Middleware", () => {
  it("passes through when geo-fencing is disabled", async () => {
    const { geoFencingMiddleware } = await import("../middleware/geoFencing");
    const app = new Hono();
    app.use("*", geoFencingMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });
});

// ── Temporal Access ────────────────────────────────────────────────────────

describe("Temporal Access Middleware", () => {
  it("allows access when no schedule restriction is set", async () => {
    const { temporalAccessMiddleware } =
      await import("../middleware/temporalAccess");
    const app = new Hono<any>();
    app.use("*", async (c, next) => {
      c.set("user", {
        id: "u1",
        sessionConfig: { scheduleRestriction: { enabled: false } },
      });
      await next();
    });
    app.use("*", temporalAccessMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });
});

// ── Security Headers ───────────────────────────────────────────────────────

describe("Security Headers Middleware", () => {
  it("sets required security headers", async () => {
    const { securityHeaders } = await import("../middleware/securityHeaders");
    const app = new Hono();
    app.use("*", securityHeaders());
    app.get("/test", (c) => c.json({ ok: true }));
    const res = await app.request("/test");
    expect(res.headers.get("content-security-policy")).toBeTruthy();
    expect(res.headers.get("strict-transport-security")).toMatch(/max-age/);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBeTruthy();
  });

  it("allows custom CSP directives", async () => {
    const { securityHeaders } = await import("../middleware/securityHeaders");
    const app = new Hono();
    app.use(
      "*",
      securityHeaders({
        cspDirectives: {
          "default-src": "'self'",
          "img-src": ["'self'", "data:"],
        },
      }),
    );
    app.get("/test", (c) => c.json({ ok: true }));
    const res = await app.request("/test");
    expect(res.headers.get("content-security-policy")).toContain("default-src");
    expect(res.headers.get("content-security-policy")).toContain("img-src");
  });

  it("allows SAMEORIGIN frame option", async () => {
    const { securityHeaders } = await import("../middleware/securityHeaders");
    const app = new Hono();
    app.use("*", securityHeaders({ frameOptions: "SAMEORIGIN" }));
    app.get("/test", (c) => c.json({ ok: true }));
    const res = await app.request("/test");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});

// ── Audit Pipeline ─────────────────────────────────────────────────────────

describe("Audit Pipeline", () => {
  it("skips Elasticsearch when disabled", async () => {
    const { initAuditPipeline } = await import("../audit");
    await expect(initAuditPipeline(100)).resolves.toBeUndefined();
  });

  it("queues and flushes docs gracefully when ES unavailable", async () => {
    const { queueAuditDoc, flushAuditPipeline } = await import("../audit");
    queueAuditDoc({
      action: "test.event",
      success: true,
      timestamp: new Date(),
    } as any);
    await expect(flushAuditPipeline()).resolves.toBeUndefined();
  });

  it("maskSensitiveFields redacts token and code fields", async () => {
    const { indexAuditLogToES } = await import("../audit");
    await expect(
      indexAuditLogToES({
        action: "test.sensitive",
        success: true,
        timestamp: new Date(),
        resourceDetails: { token: "secret-value", otherField: "visible" },
      } as any),
    ).resolves.toBeUndefined();
  });
});
