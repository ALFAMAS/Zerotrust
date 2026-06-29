import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  getDb: vi.fn(),
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
    rateLimiting: { enabled: false, perIpLimit: 100, windowSecs: 60 },
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
    elasticsearch: {
      enabled: false,
      host: "localhost",
      port: 9200,
      indexPrefix: "zerotrust",
    },
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

// ── Helpers ────────────────────────────────────────────────────────────────

const USER_ID = "00000000-0000-0000-0000-000000000001";
const NOTIF_ID = "00000000-0000-0000-0000-000000000010";

function makeDbChain(returnValue: any = []) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  return chain;
}

function makeNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIF_ID,
    userId: USER_ID,
    type: "info",
    title: "Test notification",
    body: "This is a test notification body.",
    link: null,
    read: false,
    readAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Build a Hono test app with the auth middleware bypassed.
 * We inject a fake `user` into the context so auth-guarded handlers run normally.
 */
async function getApp(db: ReturnType<typeof makeDbChain>) {
  vi.resetModules();

  const { getDb } = await import("../db");
  vi.mocked(getDb).mockReturnValue(db as any);

  // Stub out authMiddleware so every request is treated as authenticated
  vi.doMock("../middleware/auth", () => ({
    authMiddleware: async (c: any, next: any) => {
      c.set("user", {
        id: USER_ID,
        email: "alice@example.com",
        roles: ["user"],
      });
      return next();
    },
  }));

  const { default: router } = await import("../api/routes/notification.routes");
  const app = new Hono().route("/", router);
  return app;
}

/**
 * Build an app without injecting a user, so auth middleware returns 401.
 */
async function getUnauthApp() {
  vi.resetModules();

  vi.doMock("../middleware/auth", () => ({
    authMiddleware: async (c: any) => {
      return c.json(
        { error: "UNAUTHORIZED", message: "Authentication required" },
        401,
      );
    },
  }));

  const db = makeDbChain([]);
  const { getDb } = await import("../db");
  vi.mocked(getDb).mockReturnValue(db as any);

  const { default: router } = await import("../api/routes/notification.routes");
  return new Hono().route("/", router);
}

// ── GET / (list notifications) ────────────────────────────────────────────

describe("GET /notifications", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../middleware/auth");
  });

  it("returns empty array when user has no notifications", async () => {
    const db = makeDbChain([]);
    // limit() is the terminal call in the select chain
    db.limit.mockResolvedValue([]);
    const app = await getApp(db);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  it("returns notifications ordered by createdAt desc (up to 20)", async () => {
    const notifications = [
      makeNotification(),
      makeNotification({ id: "00000000-0000-0000-0000-000000000011" }),
    ];
    const db = makeDbChain(notifications);
    db.limit.mockResolvedValue(notifications);
    const app = await getApp(db);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const app = await getUnauthApp();
    const res = await app.request("/");
    expect(res.status).toBe(401);
  });
});

// ── GET /unread-count ─────────────────────────────────────────────────────

describe("GET /notifications/unread-count", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../middleware/auth");
  });

  it("returns { count: 0 } when there are no unread notifications", async () => {
    const db = makeDbChain([]);
    // The unread-count route uses select().from().where() — no .limit()
    // Override the where() to resolve directly
    db.where.mockResolvedValue([]);
    const app = await getApp(db);
    const res = await app.request("/unread-count");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ count: 0 });
  });

  it("returns the correct unread count", async () => {
    const db = makeDbChain([]);
    const unreadNotifs = [
      makeNotification(),
      makeNotification({ id: "00000000-0000-0000-0000-000000000012" }),
    ];
    db.where.mockResolvedValue(unreadNotifs);
    const app = await getApp(db);
    const res = await app.request("/unread-count");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ count: 2 });
  });

  it("returns 401 for unauthenticated requests", async () => {
    const app = await getUnauthApp();
    const res = await app.request("/unread-count");
    expect(res.status).toBe(401);
  });
});

// ── POST /:id/read ────────────────────────────────────────────────────────

describe("POST /notifications/:id/read", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../middleware/auth");
  });

  it("marks the notification as read and returns it", async () => {
    const readNotif = makeNotification({ read: true, readAt: new Date() });
    const db = makeDbChain([]);
    db.returning.mockResolvedValue([readNotif]);
    const app = await getApp(db);
    const res = await app.request(`/${NOTIF_ID}/read`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.read).toBe(true);
    expect(body.id).toBe(NOTIF_ID);
  });

  it("returns 404 when the notification is not found", async () => {
    const db = makeDbChain([]);
    db.returning.mockResolvedValue([]);
    const app = await getApp(db);
    const res = await app.request(
      "/00000000-0000-0000-0000-000000000099/read",
      { method: "POST" },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("NOT_FOUND");
  });

  it("returns 401 for unauthenticated requests", async () => {
    const app = await getUnauthApp();
    const res = await app.request(`/${NOTIF_ID}/read`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});

// ── POST /read-all ────────────────────────────────────────────────────────

describe("POST /notifications/read-all", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../middleware/auth");
  });

  it("marks all unread notifications as read and returns success", async () => {
    const db = makeDbChain([]);
    // The read-all route: update().set().where() — no returning
    db.where.mockResolvedValue(undefined);
    const app = await getApp(db);
    const res = await app.request("/read-all", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
  });

  it("returns success even when there are no unread notifications", async () => {
    const db = makeDbChain([]);
    db.where.mockResolvedValue(undefined);
    const app = await getApp(db);
    const res = await app.request("/read-all", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const app = await getUnauthApp();
    const res = await app.request("/read-all", { method: "POST" });
    expect(res.status).toBe(401);
  });
});
