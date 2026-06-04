import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockDb, enqueueDb, resetDb } = vi.hoisted(() => {
  const results: any[][] = [];
  let idx = 0;
  const next = () => results[idx++] ?? { rowCount: 0 };
  const makeChain = (): any => {
    const c: any = {};
    c.from = () => c;
    c.where = () => Promise.resolve(next());
    c.delete = () => c;
    return c;
  };
  return {
    mockDb: { delete: () => makeChain() },
    enqueueDb: (result: any) => results.push(result),
    resetDb: () => {
      results.length = 0;
      idx = 0;
    },
  };
});

vi.mock("../db", () => ({ getDb: () => mockDb }));
vi.mock("../db/schema", () => ({
  auditLogsTable: {},
  sessionsTable: {},
  refreshTokensTable: {},
  otpsTable: {},
}));
vi.mock("drizzle-orm", () => ({
  lt: vi.fn(),
  and: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
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
    enqueueDb({ rowCount: 5 });
    const { purgeOldAuditLogs } = await import("../services/dataRetention");
    const count = await purgeOldAuditLogs(90);
    expect(count).toBe(5);
  });

  it("purgeExpiredSessions returns row count", async () => {
    enqueueDb({ rowCount: 3 });
    const { purgeExpiredSessions } = await import("../services/dataRetention");
    const count = await purgeExpiredSessions(30);
    expect(count).toBe(3);
  });

  it("purgeExpiredRefreshTokens returns row count", async () => {
    enqueueDb({ rowCount: 7 });
    const { purgeExpiredRefreshTokens } = await import("../services/dataRetention");
    const count = await purgeExpiredRefreshTokens(30);
    expect(count).toBe(7);
  });

  it("purgeExpiredOtps returns row count", async () => {
    enqueueDb({ rowCount: 2 });
    const { purgeExpiredOtps } = await import("../services/dataRetention");
    const count = await purgeExpiredOtps(7);
    expect(count).toBe(2);
  });

  it("runRetentionPolicies aggregates all purge results", async () => {
    enqueueDb({ rowCount: 10 }); // audit logs
    enqueueDb({ rowCount: 4 }); // sessions
    enqueueDb({ rowCount: 6 }); // refresh tokens
    enqueueDb({ rowCount: 1 }); // otps

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
