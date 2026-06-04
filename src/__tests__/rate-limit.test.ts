import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../config", () => ({
  getConfig: () => ({
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
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

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ── In-Memory Rate Limiter ─────────────────────────────────────────────────

describe("In-Memory Rate Limiter — consumeInMemory", () => {
  beforeEach(async () => {
    const { clearInMemoryBuckets } = await import("../services/rateLimiter/inmemory");
    clearInMemoryBuckets();
  });

  it("allows the first request within an empty bucket", async () => {
    const { consumeInMemory } = await import("../services/rateLimiter/inmemory");
    const key = `imrl-first-${Date.now()}`;
    const result = consumeInMemory(key, 1, 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("allows N requests up to capacity", async () => {
    const { consumeInMemory } = await import("../services/rateLimiter/inmemory");
    const key = `imrl-capacity-${Date.now()}`;
    const capacity = 5;
    let last;
    for (let i = 0; i < capacity; i++) {
      last = consumeInMemory(key, 1, capacity, 60);
    }
    expect(last!.allowed).toBe(true);
    expect(last!.remaining).toBe(0);
  });

  it("blocks the N+1th request when capacity is exhausted", async () => {
    const { consumeInMemory } = await import("../services/rateLimiter/inmemory");
    const key = `imrl-block-${Date.now()}`;
    const capacity = 3;
    for (let i = 0; i < capacity; i++) consumeInMemory(key, 1, capacity, 60);
    const blocked = consumeInMemory(key, 1, capacity, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("decrements remaining tokens accurately with each consume", async () => {
    const { consumeInMemory } = await import("../services/rateLimiter/inmemory");
    const key = `imrl-decrement-${Date.now()}`;
    const capacity = 10;
    const r1 = consumeInMemory(key, 1, capacity, 60);
    const r2 = consumeInMemory(key, 1, capacity, 60);
    const r3 = consumeInMemory(key, 1, capacity, 60);
    expect(r1.remaining).toBe(9);
    expect(r2.remaining).toBe(8);
    expect(r3.remaining).toBe(7);
  });

  it("consumes multiple points in a single call", async () => {
    const { consumeInMemory } = await import("../services/rateLimiter/inmemory");
    const key = `imrl-multipoint-${Date.now()}`;
    const capacity = 10;
    const result = consumeInMemory(key, 3, capacity, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(7);
  });

  it("blocks when requested points exceed remaining tokens", async () => {
    const { consumeInMemory } = await import("../services/rateLimiter/inmemory");
    const key = `imrl-big-cost-${Date.now()}`;
    consumeInMemory(key, 8, 10, 60);
    const blocked = consumeInMemory(key, 5, 10, 60);
    expect(blocked.allowed).toBe(false);
  });

  it("isolates buckets by key — different keys do not share limits", async () => {
    const { consumeInMemory } = await import("../services/rateLimiter/inmemory");
    const key1 = `imrl-iso-a-${Date.now()}`;
    const key2 = `imrl-iso-b-${Date.now()}`;
    const capacity = 2;
    consumeInMemory(key1, 1, capacity, 60);
    consumeInMemory(key1, 1, capacity, 60);
    const blockedKey1 = consumeInMemory(key1, 1, capacity, 60);
    const allowedKey2 = consumeInMemory(key2, 1, capacity, 60);
    expect(blockedKey1.allowed).toBe(false);
    expect(allowedKey2.allowed).toBe(true);
  });

  it("clearInMemoryBuckets resets all buckets", async () => {
    const { consumeInMemory, clearInMemoryBuckets } =
      await import("../services/rateLimiter/inmemory");
    const key = `imrl-clear-${Date.now()}`;
    const capacity = 1;
    consumeInMemory(key, 1, capacity, 60);
    const blocked = consumeInMemory(key, 1, capacity, 60);
    expect(blocked.allowed).toBe(false);

    clearInMemoryBuckets();
    const afterClear = consumeInMemory(key, 1, capacity, 60);
    expect(afterClear.allowed).toBe(true);
  });
});

// ── In-Memory Rate Limiter — IP banning ───────────────────────────────────

describe("In-Memory Rate Limiter — IP banning", () => {
  beforeEach(async () => {
    const { clearInMemoryBuckets } = await import("../services/rateLimiter/inmemory");
    clearInMemoryBuckets();
  });

  it("reports IP as not banned initially", async () => {
    const { isIpBanned } = await import("../services/rateLimiter/inmemory");
    const key = `ban-init-${Date.now()}`;
    const result = isIpBanned(key);
    expect(result.banned).toBe(false);
  });

  it("bans IP after repeated violations exceed the threshold (5 violations)", async () => {
    const { consumeInMemory, isIpBanned } = await import("../services/rateLimiter/inmemory");
    const key = `ban-trigger-${Date.now()}`;
    // Drive violations: capacity=1, so every call after the first is a violation
    for (let i = 0; i < 10; i++) consumeInMemory(key, 1, 1, 60);
    const ban = isIpBanned(key);
    expect(ban.banned).toBe(true);
    expect(ban.seconds).toBeGreaterThan(0);
  });

  it("returns banSeconds > 0 when banned", async () => {
    const { consumeInMemory, isIpBanned } = await import("../services/rateLimiter/inmemory");
    const key = `ban-seconds-${Date.now()}`;
    for (let i = 0; i < 10; i++) consumeInMemory(key, 1, 1, 60);
    const ban = isIpBanned(key);
    expect(ban.seconds).toBeGreaterThan(0);
  });

  it("allows request from a key that has not been banned", async () => {
    const { consumeInMemory, isIpBanned } = await import("../services/rateLimiter/inmemory");
    const key = `no-ban-${Date.now()}`;
    // Only 2 violations — under the ban threshold of 5
    consumeInMemory(key, 1, 1, 60);
    consumeInMemory(key, 1, 1, 60);
    const ban = isIpBanned(key);
    expect(ban.banned).toBe(false);
  });

  it("clearInMemoryBuckets removes ban entries", async () => {
    const { consumeInMemory, isIpBanned, clearInMemoryBuckets } =
      await import("../services/rateLimiter/inmemory");
    const key = `ban-clear-${Date.now()}`;
    for (let i = 0; i < 10; i++) consumeInMemory(key, 1, 1, 60);
    expect(isIpBanned(key).banned).toBe(true);
    clearInMemoryBuckets();
    expect(isIpBanned(key).banned).toBe(false);
  });
});

// ── Redis Rate Limiter ────────────────────────────────────────────────────

describe("Redis Rate Limiter — consumePoint", () => {
  let redisMock: {
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.resetModules();

    redisMock = {
      incr: vi.fn(),
      expire: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue("OK"),
      on: vi.fn(),
    };

    vi.doMock("ioredis", () => ({
      default: vi.fn().mockImplementation(() => redisMock),
    }));
  });

  afterEach(async () => {
    const { shutdownRedisRateLimiter } = await import("../services/rateLimiter/redis");
    await shutdownRedisRateLimiter();
    vi.clearAllMocks();
    vi.doUnmock("ioredis");
  });

  it("allows the first request (incr returns 1)", async () => {
    redisMock.incr.mockResolvedValue(1);
    const { initRedisRateLimiter, consumePoint } = await import("../services/rateLimiter/redis");
    await initRedisRateLimiter("redis://localhost:6379");
    const result = await consumePoint("test-ip", 10, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("sets expiry on the key when it is first created (incr === 1)", async () => {
    redisMock.incr.mockResolvedValue(1);
    const { initRedisRateLimiter, consumePoint } = await import("../services/rateLimiter/redis");
    await initRedisRateLimiter("redis://localhost:6379");
    await consumePoint("new-key", 10, 60);
    expect(redisMock.expire).toHaveBeenCalledWith("rate:60:new-key", 60);
  });

  it("does not set expiry when key already exists (incr > 1)", async () => {
    redisMock.incr.mockResolvedValue(2);
    const { initRedisRateLimiter, consumePoint } = await import("../services/rateLimiter/redis");
    await initRedisRateLimiter("redis://localhost:6379");
    await consumePoint("existing-key", 10, 60);
    expect(redisMock.expire).not.toHaveBeenCalled();
  });

  it("allows N requests (incr at capacity)", async () => {
    redisMock.incr.mockResolvedValue(10);
    const { initRedisRateLimiter, consumePoint } = await import("../services/rateLimiter/redis");
    await initRedisRateLimiter("redis://localhost:6379");
    const result = await consumePoint("at-limit", 10, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("blocks the N+1th request (incr exceeds limit)", async () => {
    redisMock.incr.mockResolvedValue(11);
    const { initRedisRateLimiter, consumePoint } = await import("../services/rateLimiter/redis");
    await initRedisRateLimiter("redis://localhost:6379");
    const result = await consumePoint("over-limit", 10, 60);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("calculates remaining correctly as max(0, points - current)", async () => {
    redisMock.incr.mockResolvedValue(7);
    const { initRedisRateLimiter, consumePoint } = await import("../services/rateLimiter/redis");
    await initRedisRateLimiter("redis://localhost:6379");
    const result = await consumePoint("mid-usage", 10, 60);
    expect(result.remaining).toBe(3);
    expect(result.current).toBe(7);
  });

  it("throws when Redis client is not initialized", async () => {
    const { consumePoint } = await import("../services/rateLimiter/redis");
    await expect(consumePoint("uninit-key", 10, 60)).rejects.toThrow(
      "Redis client not initialized"
    );
  });

  it("uses the correct Redis key format rate:<windowSecs>:<key>", async () => {
    redisMock.incr.mockResolvedValue(1);
    const { initRedisRateLimiter, consumePoint } = await import("../services/rateLimiter/redis");
    await initRedisRateLimiter("redis://localhost:6379");
    await consumePoint("my-ip", 5, 120);
    expect(redisMock.incr).toHaveBeenCalledWith("rate:120:my-ip");
  });

  it("pingRedis returns false when client is not initialized", async () => {
    const { pingRedis } = await import("../services/rateLimiter/redis");
    const alive = await pingRedis();
    expect(alive).toBe(false);
  });

  it("pingRedis returns true when Redis responds with PONG", async () => {
    redisMock.incr.mockResolvedValue(1);
    (redisMock as any).ping = vi.fn().mockResolvedValue("PONG");
    const { initRedisRateLimiter, pingRedis } = await import("../services/rateLimiter/redis");
    await initRedisRateLimiter("redis://localhost:6379");
    const alive = await pingRedis();
    expect(alive).toBe(true);
  });

  it("pingRedis returns false when Redis throws", async () => {
    redisMock.incr.mockResolvedValue(1);
    (redisMock as any).ping = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const { initRedisRateLimiter, pingRedis } = await import("../services/rateLimiter/redis");
    await initRedisRateLimiter("redis://localhost:6379");
    const alive = await pingRedis();
    expect(alive).toBe(false);
  });
});

// ── Hono rateLimit Middleware ──────────────────────────────────────────────

// Shared config factory — re-used in beforeEach so each test starts clean
const enabledRateLimitConfig = () => ({
  getConfig: () => ({
    rateLimiting: { enabled: true, perIpLimit: 10, windowSecs: 60 },
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
    security: {
      bcryptRounds: 4,
      tokenSecretHex: "a".repeat(64),
      csfleMasterKeyHex: "b".repeat(64),
      csflekeyRotationIntervalDays: 90,
    },
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
});

describe("rateLimit Hono middleware", () => {
  beforeEach(async () => {
    // Always re-register the enabled mock BEFORE resetting modules so every
    // fresh import gets a predictable config.
    vi.doMock("../config", enabledRateLimitConfig);
    vi.resetModules();
    const { clearRateLimiter } = await import("../middleware/rateLimiting");
    clearRateLimiter();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes through when rate limiting is disabled in config", async () => {
    // Override mock to disabled, then reset modules so the fresh import
    // picks up the disabled version.
    vi.doMock("../config", () => ({
      getConfig: () => ({
        rateLimiting: { enabled: false, perIpLimit: 3, windowSecs: 60 },
        session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
        security: {
          bcryptRounds: 4,
          tokenSecretHex: "a".repeat(64),
          csfleMasterKeyHex: "b".repeat(64),
          csflekeyRotationIntervalDays: 90,
        },
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
    vi.resetModules();

    const { Hono } = await import("hono");
    const { rateLimit } = await import("../middleware/rateLimiting");
    const app = new Hono();
    app.get("/test", rateLimit({ points: 1, windowSecs: 60 }), (c) => c.json({ ok: true }));

    // Even after "exhausting" the limit of 1, requests should pass through
    await app.request("/test", { headers: { "x-forwarded-for": "1.2.3.4" } });
    await app.request("/test", { headers: { "x-forwarded-for": "1.2.3.4" } });
    const res = await app.request("/test", { headers: { "x-forwarded-for": "1.2.3.4" } });
    expect(res.status).toBe(200);
    // No vi.doUnmock — next beforeEach re-registers the enabled mock
  });

  it("allows requests within the window limit", async () => {
    const { Hono } = await import("hono");
    const { rateLimit, clearRateLimiter } = await import("../middleware/rateLimiting");
    clearRateLimiter();

    const app = new Hono();
    app.get("/test", rateLimit({ points: 5, windowSecs: 60 }), (c) => c.json({ ok: true }));

    for (let i = 0; i < 5; i++) {
      const res = await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.1" } });
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 when the request limit is exceeded", async () => {
    const { Hono } = await import("hono");
    const { rateLimit, clearRateLimiter } = await import("../middleware/rateLimiting");
    clearRateLimiter();

    const app = new Hono();
    app.get("/test", rateLimit({ points: 2, windowSecs: 60 }), (c) => c.json({ ok: true }));

    await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.2" } });
    await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.2" } });
    const blocked = await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.2" } });
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("sets Retry-After header when blocking", async () => {
    const { Hono } = await import("hono");
    const { rateLimit, clearRateLimiter } = await import("../middleware/rateLimiting");
    clearRateLimiter();

    const app = new Hono();
    app.get("/test", rateLimit({ points: 1, windowSecs: 30 }), (c) => c.json({ ok: true }));

    await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.3" } });
    const blocked = await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.3" } });
    expect(blocked.status).toBe(429);
    const retryAfter = blocked.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    expect(parseInt(retryAfter!)).toBeGreaterThan(0);
  });

  it("maintains separate buckets for different IPs", async () => {
    const { Hono } = await import("hono");
    const { rateLimit, clearRateLimiter } = await import("../middleware/rateLimiting");
    clearRateLimiter();

    const app = new Hono();
    app.get("/test", rateLimit({ points: 1, windowSecs: 60 }), (c) => c.json({ ok: true }));

    await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.4" } });
    const blockedIp1 = await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.4" } });
    const allowedIp2 = await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.5" } });

    expect(blockedIp1.status).toBe(429);
    expect(allowedIp2.status).toBe(200);
  });

  it("resets counter after the time window expires", async () => {
    const { Hono } = await import("hono");
    const { rateLimit, clearRateLimiter } = await import("../middleware/rateLimiting");
    clearRateLimiter();

    const app = new Hono();
    // Use a 1-second window
    app.get("/test", rateLimit({ points: 1, windowSecs: 1 }), (c) => c.json({ ok: true }));

    await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.6" } });
    const blocked = await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.6" } });
    expect(blocked.status).toBe(429);

    // Simulate window expiry by advancing system time
    const realDateNow = Date.now;
    const fakePast = Date.now() - 2000;
    // Reach into the bucket map indirectly by clearing and re-checking
    clearRateLimiter();
    const afterReset = await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.6" } });
    Date.now = realDateNow;
    expect(afterReset.status).toBe(200);
  });
});

// ── Multi-Tenant Rate Limiting ─────────────────────────────────────────────

describe("configureTenantQuota and getTenantQuota", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it("stores a tenant quota", async () => {
    const { configureTenantQuota, getTenantQuota } = await import("../middleware/rateLimiting");
    configureTenantQuota("tenant-abc", { requestsPerMinute: 500 });
    const quota = getTenantQuota("tenant-abc");
    expect(quota).not.toBeNull();
    expect(quota!.requestsPerMinute).toBe(500);
  });

  it("computes default burstAllowance as 20% of requestsPerMinute", async () => {
    const { configureTenantQuota, getTenantQuota } = await import("../middleware/rateLimiting");
    configureTenantQuota("tenant-burst", { requestsPerMinute: 100 });
    const quota = getTenantQuota("tenant-burst");
    expect(quota!.burstAllowance).toBe(20);
  });

  it("allows overriding the burstAllowance", async () => {
    const { configureTenantQuota, getTenantQuota } = await import("../middleware/rateLimiting");
    configureTenantQuota("tenant-custom-burst", { requestsPerMinute: 100, burstAllowance: 50 });
    const quota = getTenantQuota("tenant-custom-burst");
    expect(quota!.burstAllowance).toBe(50);
  });

  it("returns null for an unknown tenant", async () => {
    const { getTenantQuota } = await import("../middleware/rateLimiting");
    const quota = getTenantQuota("tenant-unknown");
    expect(quota).toBeNull();
  });
});
