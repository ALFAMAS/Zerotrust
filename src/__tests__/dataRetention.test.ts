import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockDb, setCount, setHeld, resetDb } = vi.hoisted(() => {
  // Per-table delete results, keyed by a tag on the (mocked) schema table —
  // order-independent so concurrent runRetentionPolicies() can't shuffle them.
  let counts: Record<string, any> = {};
  let heldRows: { id: string }[] = [];
  const makeDeleteChain = (table: any): any => {
    const tag = table?.__t ?? "unknown";
    const c: any = {};
    c.where = () => Promise.resolve(counts[tag] ?? { rowCount: 0 });
    return c;
  };
  const makeSelectChain = (): any => {
    const c: any = {};
    c.from = () => c;
    c.where = () => Promise.resolve(heldRows);
    return c;
  };
  return {
    mockDb: { delete: (table: any) => makeDeleteChain(table), select: () => makeSelectChain() },
    setCount: (tag: string, rowCount: number) => {
      counts[tag] = { rowCount };
    },
    setHeld: (ids: string[]) => {
      heldRows = ids.map((id) => ({ id }));
    },
    resetDb: () => {
      counts = {};
      heldRows = [];
    },
  };
});

vi.mock("../db", () => ({ getDb: () => mockDb }));
vi.mock("../db/schema", () => ({
  auditLogsTable: { __t: "audit", actorId: "actor_id", timestamp: "timestamp" },
  sessionsTable: { __t: "sessions" },
  refreshTokensTable: { __t: "refresh" },
  otpsTable: { __t: "otps" },
  usersTable: { id: "id", legalHold: "legal_hold" },
}));
vi.mock("drizzle-orm", () => ({
  lt: vi.fn(),
  and: vi.fn((...args) => ({ and: args })),
  eq: vi.fn(),
  or: vi.fn(),
  notInArray: vi.fn((col, ids) => ({ notInArray: ids })),
}));
vi.mock("../config", () => ({
  getConfig: () => ({
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
    security: {
      bcryptRounds: 4,
      tokenSecretHex: "a".repeat(64),
      csfleMasterKeyHex: "b".repeat(64),
      csflekeyRotationIntervalDays: 90,
    },
    rateLimiting: { enabled: false, perIpLimit: 10, windowSecs: 60 },
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

describe("Data Retention Service", () => {
  beforeEach(() => {
    resetDb();
    vi.resetModules();
  });

  it("purgeOldAuditLogs returns row count", async () => {
    setCount("audit", 5);
    const { purgeOldAuditLogs } = await import("../services/dataRetention");
    const count = await purgeOldAuditLogs(90);
    expect(count).toBe(5);
  });

  it("purgeOldAuditLogs still purges (excluding held users) when legal holds exist", async () => {
    setHeld(["user-under-hold"]);
    setCount("audit", 4);
    const { purgeOldAuditLogs } = await import("../services/dataRetention");
    const count = await purgeOldAuditLogs(90);
    // Purge still runs; held users' logs are excluded via notInArray (mocked).
    expect(count).toBe(4);
    const { notInArray } = await import("drizzle-orm");
    expect(notInArray).toHaveBeenCalled();
  });

  it("purgeExpiredSessions returns row count", async () => {
    setCount("sessions", 3);
    const { purgeExpiredSessions } = await import("../services/dataRetention");
    const count = await purgeExpiredSessions(30);
    expect(count).toBe(3);
  });

  it("purgeExpiredRefreshTokens returns row count", async () => {
    setCount("refresh", 7);
    const { purgeExpiredRefreshTokens } = await import("../services/dataRetention");
    const count = await purgeExpiredRefreshTokens(30);
    expect(count).toBe(7);
  });

  it("purgeExpiredOtps returns row count", async () => {
    setCount("otps", 2);
    const { purgeExpiredOtps } = await import("../services/dataRetention");
    const count = await purgeExpiredOtps(7);
    expect(count).toBe(2);
  });

  it("runRetentionPolicies aggregates all purge results", async () => {
    setCount("audit", 10);
    setCount("sessions", 4);
    setCount("refresh", 6);
    setCount("otps", 1);

    const { runRetentionPolicies } = await import("../services/dataRetention");
    const result = await runRetentionPolicies();
    expect(result.auditLogs).toBe(10);
    expect(result.sessions).toBe(4);
    expect(result.refreshTokens).toBe(6);
    expect(result.otps).toBe(1);
  });

  it("scheduler starts and stops without errors", async () => {
    const { startRetentionScheduler, stopRetentionScheduler } =
      await import("../services/dataRetention");
    startRetentionScheduler(24);
    stopRetentionScheduler();
  });
});
