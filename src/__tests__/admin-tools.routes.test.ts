import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(), getReadDb: vi.fn() }));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  auditLog: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: "admin-1", email: "admin@example.com", roles: ["admin"] });
    return next();
  },
  requireAdmin: async (_c: any, next: any) => next(),
}));

vi.mock("../config", () => ({
  getConfig: () => ({
    security: { tokenSecretHex: "a".repeat(64) },
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
  }),
}));

vi.mock("../services/auth/token.service", () => ({
  TokenService: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    signAccessToken: vi.fn(),
    verifyAccessToken: vi.fn(),
  })),
}));

vi.mock("../services/notifications/email.service", () => ({
  sendNotificationEmail: vi.fn(),
}));

vi.mock("../services/notifications/emailQueue", () => ({
  enqueueEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("../services/compliance/legalHold.service", () => ({
  setLegalHold: vi.fn(),
}));

function makeDb() {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
  };
  chain.from.mockReturnValue(chain);
  return chain;
}

async function getApp(readDb: ReturnType<typeof makeDb>) {
  const { getDb, getReadDb } = await import("../db");
  vi.mocked(getDb).mockReturnValue(readDb as any);
  vi.mocked(getReadDb).mockReturnValue(readDb as any);
  const { default: router } = await import("../api/routes/admin-tools.routes");
  return new Hono().route("/admin", router);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("admin tools read routes — read replica", () => {
  it("GET /admin/revenue uses getReadDb", async () => {
    const readDb = makeDb();
    readDb.select.mockImplementationOnce(() => readDb);
    readDb.from.mockResolvedValueOnce([]);
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/admin/revenue");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });

  it("GET /admin/users/export uses getReadDb", async () => {
    const readDb = makeDb();
    readDb.select.mockImplementationOnce(() => readDb);
    readDb.where.mockResolvedValueOnce([]);
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/admin/users/export");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });
});
