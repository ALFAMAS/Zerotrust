import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(), getReadDb: vi.fn() }));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: "user-1", email: "user@example.com", roles: ["user"] });
    c.set("session", { id: "session-current" });
    return next();
  },
}));

vi.mock("../middleware/sessionControl", () => ({
  revokeAllSessionsForUser: vi.fn(),
  revokeSession: vi.fn(),
}));

function makeDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
}

async function getApp(db: ReturnType<typeof makeDb>) {
  const { getDb, getReadDb } = await import("../db");
  vi.mocked(getDb).mockReturnValue(db as any);
  vi.mocked(getReadDb).mockReturnValue(db as any);
  const { default: router } = await import("../api/routes/session.routes");
  return new Hono().route("/sessions", router);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("GET /sessions", () => {
  it("uses the read replica connection for the read-heavy session list", async () => {
    const db = makeDb();
    const app = await getApp(db);
    const { getReadDb } = await import("../db");

    const res = await app.request("/sessions");

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalledTimes(1);
  });
});
