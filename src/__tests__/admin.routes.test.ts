import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(), getReadDb: vi.fn() }));

vi.mock("../shared/dbCount", () => ({
  countRows: vi.fn().mockResolvedValue(0),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: "admin-1", email: "admin@example.com", roles: ["admin"] });
    return next();
  },
  requireAdmin: async (_c: any, next: any) => next(),
}));

vi.mock("../services/shared/saasSettings.service", () => ({
  getSettings: vi.fn().mockResolvedValue({}),
  updateSettings: vi.fn(),
}));

vi.mock("../services/auth/userStateCache.service", () => ({
  invalidateUserCache: vi.fn(),
}));

vi.mock("../middleware/sessionControl", () => ({
  revokeAllSessionsForUser: vi.fn(),
  revokeSession: vi.fn(),
}));

function makeDb() {
  return {
    select: vi.fn().mockReturnThis(),
    selectDistinct: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
}

async function getApp(readDb: ReturnType<typeof makeDb>) {
  const { getDb, getReadDb } = await import("../db");
  vi.mocked(getDb).mockReturnValue(readDb as any);
  vi.mocked(getReadDb).mockReturnValue(readDb as any);
  const { default: router } = await import("../api/routes/admin.routes");
  return new Hono().route("/admin", router);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => vi.clearAllMocks());

describe("admin read routes — read replica", () => {
  it("GET /admin/users uses getReadDb", async () => {
    const readDb = makeDb();
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/admin/users");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });

  it("GET /admin/stats uses getReadDb", async () => {
    const readDb = makeDb();
    readDb.where.mockResolvedValue([]);
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/admin/stats");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });

  it("GET /admin/sessions uses getReadDb", async () => {
    const readDb = makeDb();
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/admin/sessions");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });

  it("GET /admin/roles uses getReadDb", async () => {
    const readDb = makeDb();
    readDb.orderBy.mockResolvedValue([]);
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/admin/roles");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });

  it("GET /admin/users/:id uses getReadDb", async () => {
    const readDb = makeDb();
    readDb.limit.mockResolvedValueOnce([
      {
        id: "user-1",
        email: "user@example.com",
        displayName: "User",
        username: null,
        phone: null,
        status: "active",
        roles: ["user"],
        locale: "en",
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
        mfa: null,
        passkeys: [],
        oauthProviders: [],
      },
    ]);
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/admin/users/user-1");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });

  it("GET /admin/audit-logs uses getReadDb", async () => {
    const readDb = makeDb();
    readDb.limit.mockResolvedValueOnce([{ plan: "pro", status: "active" }]);
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/admin/audit-logs");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });

  it("GET /admin/feedback uses getReadDb", async () => {
    const readDb = makeDb();
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/admin/feedback");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });

  it("GET /admin/jit-grants uses getReadDb", async () => {
    const readDb = makeDb();
    readDb.orderBy.mockResolvedValue([]);
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/admin/jit-grants");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });

  it("GET /admin/attachments uses getReadDb", async () => {
    const readDb = makeDb();
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/admin/attachments");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });
});
