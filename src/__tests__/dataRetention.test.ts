import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockDb, setCount, setHeld, setPendingDeletions, getUpdateCalls, resetDb } = vi.hoisted(() => {
  // Per-table delete results, keyed by a tag on the (mocked) schema table —
  // order-independent so concurrent runRetentionPolicies() can't shuffle them.
  let counts: Record<string, any> = {};
  let heldRows: { id: string }[] = [];
  // Rows eligible for the GDPR scheduled-deletion purge — separate from
  // `heldRows` (legal holds) since purgeScheduledDeletions() and
  // getHeldUserIds() both select() from the same mocked usersTable but for
  // different purposes; defaults to [] (nothing pending) so the aggregate
  // runRetentionPolicies() test doesn't have to care about call ordering
  // between the two concurrent purges.
  let pendingDeletionRows: { id: string; legalHold: boolean }[] = [];
  const updateCalls: { table: string; set: any }[] = [];
  const makeDeleteChain = (table: any): any => {
    const tag = table?.__t ?? "unknown";
    const c: any = {};
    // The `postgres` driver's delete-without-.returning() result exposes the
    // affected row count as `.count`, not `.rowCount` — matches the real
    // runtime shape (see postgres package's ResultQueryMeta).
    c.where = () => Promise.resolve(counts[tag] ?? { count: 0 });
    return c;
  };
  const makeSelectChain = (columns: any): any => {
    const c: any = {};
    c.from = () => c;
    // purgeScheduledDeletions() selects {id, legalHold} (two columns);
    // getHeldUserIds() selects {id} (one column) — enough to disambiguate
    // the two call sites sharing this mock without real query introspection.
    c.where = () =>
      Promise.resolve(columns && Object.keys(columns).length > 1 ? pendingDeletionRows : heldRows);
    return c;
  };
  const makeUpdateChain = (table: any): any => {
    const tag = table?.__t ?? "users";
    const c: any = {};
    let pendingSet: any;
    c.set = (values: any) => {
      pendingSet = values;
      return c;
    };
    c.where = (whereClause: any) => {
      updateCalls.push({ table: tag, set: pendingSet, where: whereClause });
      return Promise.resolve(undefined);
    };
    return c;
  };
  return {
    mockDb: {
      delete: (table: any) => makeDeleteChain(table),
      select: (columns: any) => makeSelectChain(columns),
      update: (table: any) => makeUpdateChain(table),
    },
    setCount: (tag: string, count: number) => {
      counts[tag] = { count };
    },
    setHeld: (ids: string[]) => {
      heldRows = ids.map((id) => ({ id }));
    },
    setPendingDeletions: (rows: { id: string; legalHold: boolean }[]) => {
      pendingDeletionRows = rows;
    },
    getUpdateCalls: () => updateCalls,
    resetDb: () => {
      counts = {};
      heldRows = [];
      pendingDeletionRows = [];
      updateCalls.length = 0;
    },
  };
});

vi.mock("../db", () => ({ getDb: () => mockDb }));
vi.mock("../db/schema", () => ({
  auditLogsTable: { __t: "audit", actorId: "actor_id", timestamp: "timestamp" },
  sessionsTable: { __t: "sessions" },
  refreshTokensTable: { __t: "refresh" },
  otpsTable: { __t: "otps" },
  usersTable: { __t: "users", id: "id", legalHold: "legal_hold", metadata: "metadata" },
}));
vi.mock("drizzle-orm", () => ({
  lt: vi.fn(),
  and: vi.fn((...args) => ({ and: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  or: vi.fn(),
  notInArray: vi.fn((col, ids) => ({ notInArray: ids })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (s: string) => s }
  ),
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
    rateLimiting: { enabled: false, perIpLimit: 10, windowSecs: 60 },
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

describe("Data Retention Service", () => {
  beforeEach(() => {
    resetDb();
    vi.resetModules();
  });

  it("purgeOldAuditLogs returns row count", async () => {
    setCount("audit", 5);
    const { purgeOldAuditLogs } = await import("../services/compliance/dataRetention");
    const count = await purgeOldAuditLogs(90);
    expect(count).toBe(5);
  });

  it("purgeOldAuditLogs still purges (excluding held users) when legal holds exist", async () => {
    setHeld(["user-under-hold"]);
    setCount("audit", 4);
    const { purgeOldAuditLogs } = await import("../services/compliance/dataRetention");
    const count = await purgeOldAuditLogs(90);
    // Purge still runs; held users' logs are excluded via notInArray (mocked).
    expect(count).toBe(4);
    const { notInArray } = await import("drizzle-orm");
    expect(notInArray).toHaveBeenCalled();
  });

  it("purgeExpiredSessions returns row count", async () => {
    setCount("sessions", 3);
    const { purgeExpiredSessions } = await import("../services/compliance/dataRetention");
    const count = await purgeExpiredSessions(30);
    expect(count).toBe(3);
  });

  it("purgeExpiredRefreshTokens returns row count", async () => {
    setCount("refresh", 7);
    const { purgeExpiredRefreshTokens } =
      await import("../services/compliance/dataRetention");
    const count = await purgeExpiredRefreshTokens(30);
    expect(count).toBe(7);
  });

  it("purgeExpiredOtps returns row count", async () => {
    setCount("otps", 2);
    const { purgeExpiredOtps } = await import("../services/compliance/dataRetention");
    const count = await purgeExpiredOtps(7);
    expect(count).toBe(2);
  });

  it("runRetentionPolicies aggregates all purge results", async () => {
    setCount("audit", 10);
    setCount("sessions", 4);
    setCount("refresh", 6);
    setCount("otps", 1);

    const { runRetentionPolicies } = await import("../services/compliance/dataRetention");
    const result = await runRetentionPolicies();
    expect(result.auditLogs).toBe(10);
    expect(result.sessions).toBe(4);
    expect(result.refreshTokens).toBe(6);
    expect(result.otps).toBe(1);
    // M7: the GDPR account-deletion purge is now part of the scheduled
    // retention run — it used to be defined but never actually invoked
    // anywhere, so the "deleted in 30 days" promise was never kept.
    expect(result.gdprDeletions).toBe(0);
  });

  // ── M7: GDPR scheduled-deletion purge respects legal hold ─────────────────

  describe("purgeScheduledDeletions (M7)", () => {
    it("purges accounts whose deletion grace period has elapsed", async () => {
      setPendingDeletions([
        { id: "user-a", legalHold: false },
        { id: "user-b", legalHold: false },
      ]);
      const { purgeScheduledDeletions } = await import("../services/compliance/dataRetention");
      const count = await purgeScheduledDeletions();
      expect(count).toBe(2);
      const updates = getUpdateCalls();
      expect(updates).toHaveLength(2);
      expect(updates.every((u) => u.set.status === "deleted")).toBe(true);
    });

    it("never purges an account under legal hold, even if it's in the candidate set", async () => {
      // Simulates the query-level filter being bypassed/weakened: a
      // legal-hold row still reaches the loop, and the in-loop guard must
      // catch it (defense in depth) rather than the row simply never being
      // fetched.
      setPendingDeletions([
        { id: "user-a", legalHold: false },
        { id: "user-held", legalHold: true },
      ]);
      const { purgeScheduledDeletions } = await import("../services/compliance/dataRetention");
      const count = await purgeScheduledDeletions();
      expect(count).toBe(1);
      const updates = getUpdateCalls();
      // Only user-a's row should ever reach an UPDATE — user-held must
      // never be targeted despite being in the candidate set.
      expect(updates).toHaveLength(1);
      expect(updates[0].where).toEqual({ eq: ["id", "user-a"] });
    });

    it("returns 0 and does not throw when nothing is pending", async () => {
      setPendingDeletions([]);
      const { purgeScheduledDeletions } = await import("../services/compliance/dataRetention");
      await expect(purgeScheduledDeletions()).resolves.toBe(0);
      expect(getUpdateCalls()).toHaveLength(0);
    });
  });

  it("scheduler starts and stops without errors", async () => {
    const { startRetentionScheduler, stopRetentionScheduler } =
      await import("../services/compliance/dataRetention");
    startRetentionScheduler(24);
    stopRetentionScheduler();
  });
});
