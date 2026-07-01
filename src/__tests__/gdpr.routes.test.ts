import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const { mockDb, enqueueDb, resetDb } = vi.hoisted(() => {
  const results: any[][] = [];
  let idx = 0;
  const next = () => results[idx++] ?? [];
  const makeChain = (): any => {
    const c: any = {};
    c.select = () => c;
    c.from = () => c;
    c.where = () => c;
    c.orderBy = () => c;
    c.limit = () => Promise.resolve(next());
    c.update = () => c;
    c.set = () => c;
    c.then = (res: any, rej?: any) => Promise.resolve(next()).then(res, rej);
    return c;
  };
  return {
    mockDb: {
      select: () => makeChain(),
      update: () => makeChain(),
    },
    enqueueDb: (rows: any[]) => results.push(rows),
    resetDb: () => {
      results.length = 0;
      idx = 0;
    },
  };
});

vi.mock("../db", () => ({ getDb: () => mockDb }));
vi.mock("../db/schema", () => ({
  usersTable: {},
  sessionsTable: {},
  auditLogsTable: {},
  organizationMembersTable: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));
vi.mock("../middleware/auth", () => ({
  authMiddleware: vi.fn().mockImplementation(async (c: any, next: any) => {
    c.set("user", {
      id: "user-1",
      email: "test@example.com",
      displayName: "Test User",
    });
    await next();
  }),
}));
vi.mock("../middleware/rateLimiting", () => ({
  rateLimit: () => async (_c: any, next: any) => await next(),
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

async function buildApp() {
  const { default: gdprRoutes } = await import("../api/routes/gdpr.routes");
  const app = new Hono();
  app.route("/gdpr", gdprRoutes);
  return app;
}

const mockProfile = {
  id: "user-1",
  email: "test@example.com",
  username: "testuser",
  displayName: "Test User",
  phone: null,
  avatarUrl: null,
  roles: ["user"],
  attributes: {},
  status: "active",
  createdAt: new Date(),
  lastLoginAt: null,
  sessionConfig: {},
  metadata: null,
  mfa: { totp: { enabled: false }, webauthn: { enabled: false } },
};

describe("GDPR Routes", () => {
  beforeEach(() => {
    resetDb();
    vi.resetModules();
  });

  it("GET /gdpr/export returns user data as JSON", async () => {
    enqueueDb([mockProfile]); // profile query
    enqueueDb([]); // sessions
    enqueueDb([]); // audit logs
    enqueueDb([]); // org memberships

    const app = await buildApp();
    const res = await app.request("/gdpr/export");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.id).toBe("user-1");
    expect(body.profile.email).toBe("test@example.com");
    expect(body).toHaveProperty("sessions");
    expect(body).toHaveProperty("auditLogs");
    expect(body).toHaveProperty("organizations");
    expect(body).toHaveProperty("exportedAt");
  });

  it("GET /gdpr/export returns 404 for unknown user", async () => {
    enqueueDb([]); // no profile

    const app = await buildApp();
    const res = await app.request("/gdpr/export");
    expect(res.status).toBe(404);
  });

  it("DELETE /gdpr/account schedules deletion", async () => {
    enqueueDb([mockProfile]); // profile
    enqueueDb([{}]); // update user
    enqueueDb([{}]); // revoke sessions

    const app = await buildApp();
    const res = await app.request("/gdpr/account", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("scheduledFor");
    expect(body.message).toContain("30 days");
  });

  it("DELETE /gdpr/account returns 409 if deletion already requested", async () => {
    const profileWithDeletion = {
      ...mockProfile,
      metadata: { deletionRequestedAt: new Date().toISOString() },
    };
    enqueueDb([profileWithDeletion]);

    const app = await buildApp();
    const res = await app.request("/gdpr/account", { method: "DELETE" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("DELETION_ALREADY_REQUESTED");
  });

  it("POST /gdpr/account/deletion/cancel removes deletion metadata", async () => {
    const profileWithDeletion = {
      ...mockProfile,
      metadata: {
        deletionRequestedAt: new Date().toISOString(),
        deletionScheduledFor: new Date(Date.now() + 86400000).toISOString(),
      },
    };
    enqueueDb([profileWithDeletion]); // profile
    enqueueDb([{}]); // update

    const app = await buildApp();
    const res = await app.request("/gdpr/account/deletion/cancel", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("cancelled");
  });

  it("POST /gdpr/account/deletion/cancel returns 400 when no deletion pending", async () => {
    enqueueDb([mockProfile]); // profile with no deletion metadata

    const app = await buildApp();
    const res = await app.request("/gdpr/account/deletion/cancel", {
      method: "POST",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("NO_DELETION_PENDING");
  });
});
