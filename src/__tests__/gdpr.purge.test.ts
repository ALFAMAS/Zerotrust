import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, selectResults, updateCalls, resetMocks } = vi.hoisted(() => {
  const results: unknown[][] = [];
  let idx = 0;
  const updateCalls: unknown[] = [];
  const makeChain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.from = () => c;
    c.where = () => c;
    c.limit = () => Promise.resolve(results[idx++] ?? []);
    c.update = () => c;
    c.set = (values: unknown) => {
      updateCalls.push(values);
      return c;
    };
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(results[idx++] ?? []).then(res, rej);
    return c;
  };
  return {
    mockDb: {
      select: () => makeChain(),
      update: () => makeChain(),
    },
    selectResults: results,
    updateCalls: updateCalls as unknown[],
    resetMocks: () => {
      results.length = 0;
      updateCalls.length = 0;
      idx = 0;
    },
  };
});

vi.mock("../db", () => ({ getDb: () => mockDb }));
vi.mock("../db/schema", () => ({
  usersTable: { id: "id", legalHold: "legal_hold", metadata: "metadata" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn((...args) => ({ and: args })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values }),
}));
vi.mock("../config", () => ({
  getConfig: () => ({
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
    security: { bcryptRounds: 4, tokenSecretHex: "a".repeat(64), csfleMasterKeyHex: "b".repeat(64) },
    rateLimiting: { enabled: false, perIpLimit: 10, windowSecs: 60 },
    geofencing: { enabled: false, allowedCountries: [], allowedIpRanges: [] },
    mfa: { totpWindow: 1, otpExpirySecs: 900, maxOTPAttempts: 5, channels: { email: { enabled: true } } },
    oauth: { providers: {} },
    elasticsearch: { enabled: false, host: "localhost", port: 9200, indexPrefix: "zerotrust" },
    logging: { level: "error", format: "json" },
  }),
}));

describe("purgeScheduledDeletions (M7)", () => {
  beforeEach(() => {
    resetMocks();
    vi.resetModules();
  });

  it("purges only users returned by the targeted query (not a full-table scan)", async () => {
    selectResults.push([{ id: "user-due" }]);
    selectResults.push([]);

    const { purgeScheduledDeletions } = await import("../services/compliance/dataRetention");
    const count = await purgeScheduledDeletions();

    expect(count).toBe(1);
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0]).toMatchObject({ status: "deleted", displayName: "Deleted User" });
  });

  it("returns 0 when no users are due for purge", async () => {
    selectResults.push([]);

    const { purgeScheduledDeletions } = await import("../services/compliance/dataRetention");
    const count = await purgeScheduledDeletions();

    expect(count).toBe(0);
    expect(updateCalls.length).toBe(0);
  });
});
