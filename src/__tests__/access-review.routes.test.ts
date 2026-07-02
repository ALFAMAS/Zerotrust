import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../audit/chain", () => ({
  insertAuditLog: vi.fn(),
}));

vi.mock("../services/auth/userStateCache.service", () => ({
  invalidateUserCache: vi.fn(),
}));

function makeDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    groupBy: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
}

async function getApp(readDb: ReturnType<typeof makeDb>) {
  const { getDb, getReadDb } = await import("../db");
  vi.mocked(getDb).mockReturnValue(readDb as any);
  vi.mocked(getReadDb).mockReturnValue(readDb as any);
  const { default: router } = await import("../api/routes/access-review.routes");
  return new Hono().route("/access-reviews", router);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("access review read routes — read replica", () => {
  it("GET /access-reviews uses getReadDb", async () => {
    const readDb = makeDb();
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/access-reviews");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });

  it("GET /access-reviews/:id uses getReadDb", async () => {
    const readDb = makeDb();
    readDb.limit.mockResolvedValueOnce([
      {
        id: "review-1",
        title: "Review",
        note: null,
        status: "open",
        createdBy: "admin-1",
        createdByEmail: "admin@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      },
    ]);
    const app = await getApp(readDb);
    const { getReadDb } = await import("../db");

    const res = await app.request("/access-reviews/review-1");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalled();
  });
});
