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

// ── Finding 16: impersonation token carries the delegation chain ───────────

describe("POST /admin/users/:id/impersonate — delegation chain", () => {
  it("mints the impersonation token with act_as: [adminId]", async () => {
    const db = makeDb();
    const targetId = "target-user-1";
    db.limit.mockResolvedValueOnce([
      { id: targetId, email: "target@example.com", displayName: "Target", roles: ["user"] },
    ]);

    const { TokenService } = await import("../services/auth/token.service");
    const signAccessToken = vi.fn().mockResolvedValue("signed-token");
    const verifyAccessToken = vi.fn().mockResolvedValue({ jti: "jti-1" });
    // TokenService is invoked with `new` (inside getTokenService), so the
    // mock implementation must be a constructable function, not an arrow fn.
    vi.mocked(TokenService).mockImplementation(function (this: any) {
      this.init = vi.fn();
      this.signAccessToken = signAccessToken;
      this.verifyAccessToken = verifyAccessToken;
      return this;
    } as any);

    const app = await getApp(db);
    const res = await app.request(`/admin/users/${targetId}/impersonate`, { method: "POST" });

    expect(res.status).toBe(200);
    expect(signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ sub: targetId, act_as: ["admin-1"] })
    );
  });

  it("refuses to impersonate from an already-impersonated session (no chaining)", async () => {
    vi.resetModules();
    vi.doMock("../middleware/auth", () => ({
      authMiddleware: async (c: any, next: any) => {
        c.set("user", { id: "admin-1", email: "admin@example.com", roles: ["admin"] });
        c.set("token", { scope: ["openid", "impersonation"], act_as: ["root-admin"] });
        return next();
      },
      requireAdmin: async (_c: any, next: any) => next(),
    }));
    const app = await getApp(makeDb());
    const res = await app.request("/admin/users/someone/impersonate", { method: "POST" });
    expect(res.status).toBe(403);
    vi.doUnmock("../middleware/auth");
  });
});
