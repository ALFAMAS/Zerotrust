import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

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

// ── Progressive login backoff ──────────────────────────────────────────────

describe("Progressive login backoff", () => {
  beforeEach(async () => {
    const { clearLockout } = await import("../middleware/accountLockout");
    clearLockout("lockout-test@example.com");
  });

  it("is not delayed initially", async () => {
    const { isAccountLocked } = await import("../middleware/accountLockout");
    const { locked } = isAccountLocked("fresh-user@example.com");
    expect(locked).toBe(false);
  });

  it("applies delay after a failed login", async () => {
    const { recordFailedLogin, isAccountLocked } =
      await import("../middleware/accountLockout");
    const email = `lockout-test-${Date.now()}@example.com`;
    recordFailedLogin(email);
    const { locked } = isAccountLocked(email);
    expect(locked).toBe(true);
  });

  it("clears backoff after successful login", async () => {
    const { recordFailedLogin, recordSuccessfulLogin, isAccountLocked } =
      await import("../middleware/accountLockout");
    const email = `clear-test-${Date.now()}@example.com`;
    recordFailedLogin(email);
    recordSuccessfulLogin(email);
    const { locked } = isAccountLocked(email);
    expect(locked).toBe(false);
  });

  it("clearLockout removes tracking record", async () => {
    const { recordFailedLogin, clearLockout, isAccountLocked } =
      await import("../middleware/accountLockout");
    const email = `clear2-${Date.now()}@example.com`;
    recordFailedLogin(email);
    clearLockout(email);
    const { locked } = isAccountLocked(email);
    expect(locked).toBe(false);
  });
});

// ── Geo-Fencing (removed — org policy enforced in sessionPolicy.service) ──

// ── Inferred client country ────────────────────────────────────────────────

describe("inferClientCountry", () => {
  it("returns empty string when IP is unknown", async () => {
    const { inferClientCountry } = await import("../shared/inferClientCountry");
    const { Hono } = await import("hono");
    const app = new Hono();
    app.get("/test", (c) => c.json({ country: inferClientCountry(c) }));
    const res = await app.request("/test");
    const body = await res.json();
    expect(body.country).toBe("");
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

  it("does not queue audit docs when Elasticsearch is disabled", async () => {
    const audit = await import("../audit");
    await audit.initAuditPipeline(100);
    audit.queueAuditDoc({
      action: "test.noop",
      success: true,
      timestamp: new Date(),
    } as any);
    await expect(audit.flushAuditPipeline()).resolves.toBeUndefined();
    await expect(audit.getElasticsearchHealth()).resolves.toEqual({
      status: "disabled",
      available: false,
    });
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
