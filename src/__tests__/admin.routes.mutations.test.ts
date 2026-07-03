import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
// admin.routes.ts imports with EXTENSIONLESS specifiers (../../db,
// ../../logger, ...), so mock specifier strings here must be extensionless
// too (../db, ../logger, ...).

vi.mock("../db", () => ({ getDb: vi.fn(), getReadDb: vi.fn() }));

// Default: "no other active admins" (last-admin guard trips) unless a test
// overrides it with mockResolvedValueOnce/mockResolvedValue.
const countRows = vi.fn().mockResolvedValue(0);
vi.mock("../shared/dbCount", () => ({
  countRows: (...a: unknown[]) => countRows(...a),
}));

const auditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  auditLog: (...a: unknown[]) => auditLog(...a),
}));

const ADMIN_ID = "admin-00000000-0000-0000-0000-000000000001";
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: ADMIN_ID, email: "admin@example.com", roles: ["admin"] });
    return next();
  },
  requireAdmin: async (_c: any, next: any) => next(),
}));

vi.mock("../models/settings.model", () => ({
  getSettings: vi.fn().mockResolvedValue({}),
  updateSettings: vi.fn().mockImplementation(async (partial: Record<string, unknown>) => partial),
}));

const invalidateUserCache = vi.fn();
vi.mock("../services/auth/userStateCache.service", () => ({
  invalidateUserCache: (...a: unknown[]) => invalidateUserCache(...a),
}));

const revokeAllSessionsForUser = vi.fn().mockResolvedValue(1);
const revokeSession = vi.fn();
vi.mock("../middleware/sessionControl", () => ({
  revokeAllSessionsForUser: (...a: unknown[]) => revokeAllSessionsForUser(...a),
  revokeSession: (...a: unknown[]) => revokeSession(...a),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const TARGET_USER_ID = "user-00000000-0000-0000-0000-000000000002";

/** Queue-based DB mock: each `.limit()` call consumes the next queued select
 * result; each `.returning()` call consumes the next queued write result. */
function makeQueuedDb() {
  const selectResults: unknown[][] = [];
  const returningResults: unknown[][] = [];
  let selectIdx = 0;
  let returningIdx = 0;

  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve(selectResults[selectIdx++] ?? [])),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi
      .fn()
      .mockImplementation(() => Promise.resolve(returningResults[returningIdx++] ?? [])),
  };

  return {
    chain,
    queueSelect: (rows: unknown[]) => selectResults.push(rows),
    queueReturning: (rows: unknown[]) => returningResults.push(rows),
  };
}

async function getApp(db: ReturnType<typeof makeQueuedDb>["chain"]) {
  const { getDb, getReadDb } = await import("../db");
  vi.mocked(getDb).mockReturnValue(db);
  vi.mocked(getReadDb).mockReturnValue(db);
  const { default: router } = await import("../api/routes/admin.routes");
  return new Hono().route("/admin", router);
}

function req(app: Hono, method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  revokeAllSessionsForUser.mockResolvedValue(1);
});
afterEach(() => vi.clearAllMocks());

// ── C2: every sensitive admin mutation must land in the audit chain ────────

describe("admin.routes mutations — audit coverage (C2)", () => {
  it("PUT /settings audits the change with the admin id and the diff", async () => {
    const { chain } = makeQueuedDb();
    const app = await getApp(chain);

    const res = await req(app, "PUT", "/admin/settings", { requireMfaForAll: true });
    expect(res.status).toBe(200);
    expect(auditLog).toHaveBeenCalledWith(
      "admin.settings_updated",
      ADMIN_ID,
      "saas_settings",
      true,
      { changes: { requireMfaForAll: true } }
    );
  });

  it("PATCH /users/:id audits a status change", async () => {
    const { chain, queueReturning } = makeQueuedDb();
    queueReturning([
      { id: TARGET_USER_ID, email: "target@example.com", displayName: "Target", status: "suspended" },
    ]);
    const app = await getApp(chain);

    const res = await req(app, "PATCH", `/admin/users/${TARGET_USER_ID}`, { status: "suspended" });
    expect(res.status).toBe(200);
    expect(auditLog).toHaveBeenCalledWith(
      "admin.user_updated",
      ADMIN_ID,
      TARGET_USER_ID,
      true,
      { changes: expect.objectContaining({ status: "suspended" }) }
    );
  });

  it("PATCH /users/:id does NOT audit when the target user is not found", async () => {
    const { chain, queueReturning } = makeQueuedDb();
    queueReturning([]); // no rows updated — user not found
    const app = await getApp(chain);

    const res = await req(app, "PATCH", `/admin/users/${TARGET_USER_ID}`, { status: "suspended" });
    expect(res.status).toBe(404);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("DELETE /users/:id audits the soft-delete", async () => {
    const { chain, queueReturning } = makeQueuedDb();
    queueReturning([{ id: TARGET_USER_ID }]);
    const app = await getApp(chain);

    const res = await req(app, "DELETE", `/admin/users/${TARGET_USER_ID}`);
    expect(res.status).toBe(200);
    expect(revokeAllSessionsForUser).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(auditLog).toHaveBeenCalledWith("admin.user_deleted", ADMIN_ID, TARGET_USER_ID, true);
  });

  it("POST /users/:id/roles audits a role grant", async () => {
    const { chain, queueSelect } = makeQueuedDb();
    queueSelect([{ id: "role-1" }]); // role lookup
    queueSelect([{ id: TARGET_USER_ID, roles: ["user"] }]); // user lookup
    const app = await getApp(chain);

    const res = await req(app, "POST", `/admin/users/${TARGET_USER_ID}/roles`, {
      roleName: "admin",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.roles).toEqual(["user", "admin"]);
    expect(auditLog).toHaveBeenCalledWith("admin.role_granted", ADMIN_ID, TARGET_USER_ID, true, {
      role: "admin",
    });
  });

  it("POST /users/:id/roles does NOT audit a no-op grant (role already present)", async () => {
    const { chain, queueSelect } = makeQueuedDb();
    queueSelect([{ id: "role-1" }]);
    queueSelect([{ id: TARGET_USER_ID, roles: ["user", "admin"] }]);
    const app = await getApp(chain);

    const res = await req(app, "POST", `/admin/users/${TARGET_USER_ID}/roles`, {
      roleName: "admin",
    });
    expect(res.status).toBe(200);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("DELETE /users/:id/roles/:roleName audits a role revoke", async () => {
    const { chain, queueSelect } = makeQueuedDb();
    queueSelect([{ id: TARGET_USER_ID, roles: ["user", "admin"], status: "active" }]);
    countRows.mockResolvedValueOnce(2); // other active admins remain
    const app = await getApp(chain);

    const res = await req(app, "DELETE", `/admin/users/${TARGET_USER_ID}/roles/admin`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.roles).toEqual(["user"]);
    expect(auditLog).toHaveBeenCalledWith("admin.role_revoked", ADMIN_ID, TARGET_USER_ID, true, {
      role: "admin",
    });
  });
});

// ── H4: last-admin / self-lockout guards ────────────────────────────────────

describe("admin.routes mutations — last-admin & self-lockout guards (H4)", () => {
  describe("PATCH /users/:id (deactivating an admin)", () => {
    it("409s when an admin tries to change their own status", async () => {
      const { chain, queueSelect } = makeQueuedDb();
      queueSelect([{ id: ADMIN_ID, roles: ["admin"], status: "active" }]);
      const app = await getApp(chain);

      const res = await req(app, "PATCH", `/admin/users/${ADMIN_ID}`, { status: "suspended" });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("SELF_LOCKOUT");
      expect(auditLog).not.toHaveBeenCalled();
    });

    it("409s when deactivating the last remaining active admin", async () => {
      const { chain, queueSelect } = makeQueuedDb();
      queueSelect([{ id: TARGET_USER_ID, roles: ["admin"], status: "active" }]);
      countRows.mockResolvedValueOnce(0); // no other active admins
      const app = await getApp(chain);

      const res = await req(app, "PATCH", `/admin/users/${TARGET_USER_ID}`, {
        status: "suspended",
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("LAST_ADMIN");
    });

    it("allows deactivating an admin when other active admins remain", async () => {
      const { chain, queueSelect, queueReturning } = makeQueuedDb();
      queueSelect([{ id: TARGET_USER_ID, roles: ["admin"], status: "active" }]);
      countRows.mockResolvedValueOnce(2); // other active admins remain
      queueReturning([
        { id: TARGET_USER_ID, email: "t@example.com", displayName: "T", status: "suspended" },
      ]);
      const app = await getApp(chain);

      const res = await req(app, "PATCH", `/admin/users/${TARGET_USER_ID}`, {
        status: "suspended",
      });
      expect(res.status).toBe(200);
      expect(auditLog).toHaveBeenCalled();
    });

    it("allows deactivating a non-admin user regardless of admin count", async () => {
      const { chain, queueSelect, queueReturning } = makeQueuedDb();
      queueSelect([{ id: TARGET_USER_ID, roles: ["user"], status: "active" }]);
      queueReturning([
        { id: TARGET_USER_ID, email: "t@example.com", displayName: "T", status: "suspended" },
      ]);
      const app = await getApp(chain);

      const res = await req(app, "PATCH", `/admin/users/${TARGET_USER_ID}`, {
        status: "suspended",
      });
      expect(res.status).toBe(200);
      // countRows must not even matter here — the guard should short-circuit
      // on "target isn't an active admin" before ever counting.
      expect(auditLog).toHaveBeenCalled();
    });
  });

  describe("DELETE /users/:id (soft-delete)", () => {
    it("409s when an admin tries to delete their own account", async () => {
      const { chain, queueSelect } = makeQueuedDb();
      queueSelect([{ id: ADMIN_ID, roles: ["admin"], status: "active" }]);
      const app = await getApp(chain);

      const res = await req(app, "DELETE", `/admin/users/${ADMIN_ID}`);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("SELF_LOCKOUT");
    });

    it("409s when deleting the last remaining active admin", async () => {
      const { chain, queueSelect } = makeQueuedDb();
      queueSelect([{ id: TARGET_USER_ID, roles: ["admin"], status: "active" }]);
      countRows.mockResolvedValueOnce(0);
      const app = await getApp(chain);

      const res = await req(app, "DELETE", `/admin/users/${TARGET_USER_ID}`);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("LAST_ADMIN");
    });

    it("allows deleting an admin when other active admins remain", async () => {
      const { chain, queueSelect, queueReturning } = makeQueuedDb();
      queueSelect([{ id: TARGET_USER_ID, roles: ["admin"], status: "active" }]);
      countRows.mockResolvedValueOnce(2);
      queueReturning([{ id: TARGET_USER_ID }]);
      const app = await getApp(chain);

      const res = await req(app, "DELETE", `/admin/users/${TARGET_USER_ID}`);
      expect(res.status).toBe(200);
      expect(auditLog).toHaveBeenCalledWith("admin.user_deleted", ADMIN_ID, TARGET_USER_ID, true);
    });
  });

  describe("DELETE /users/:id/roles/:roleName (revoking admin)", () => {
    it("409s when an admin tries to revoke their own admin role", async () => {
      const { chain, queueSelect } = makeQueuedDb();
      queueSelect([{ id: ADMIN_ID, roles: ["admin"], status: "active" }]);
      const app = await getApp(chain);

      const res = await req(app, "DELETE", `/admin/users/${ADMIN_ID}/roles/admin`);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("SELF_LOCKOUT");
    });

    it("409s when revoking admin from the last remaining active admin", async () => {
      const { chain, queueSelect } = makeQueuedDb();
      queueSelect([{ id: TARGET_USER_ID, roles: ["user", "admin"], status: "active" }]);
      countRows.mockResolvedValueOnce(0);
      const app = await getApp(chain);

      const res = await req(app, "DELETE", `/admin/users/${TARGET_USER_ID}/roles/admin`);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("LAST_ADMIN");
    });

    it("allows revoking a non-admin role regardless of admin count", async () => {
      const { chain, queueSelect } = makeQueuedDb();
      queueSelect([{ id: TARGET_USER_ID, roles: ["user", "editor"], status: "active" }]);
      const app = await getApp(chain);

      const res = await req(app, "DELETE", `/admin/users/${TARGET_USER_ID}/roles/editor`);
      expect(res.status).toBe(200);
      expect(auditLog).toHaveBeenCalledWith("admin.role_revoked", ADMIN_ID, TARGET_USER_ID, true, {
        role: "editor",
      });
    });
  });
});

// ── H5: PUT /settings validation ────────────────────────────────────────────

describe("admin.routes mutations — settings validation (H5)", () => {
  it("rejects an out-of-bounds sessionTTLSeconds", async () => {
    const { chain } = makeQueuedDb();
    const app = await getApp(chain);

    const res = await req(app, "PUT", "/admin/settings", { sessionTTLSeconds: 10 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("rejects accountLockoutThreshold of 0 (would disable lockout entirely)", async () => {
    const { chain } = makeQueuedDb();
    const app = await getApp(chain);

    const res = await req(app, "PUT", "/admin/settings", { accountLockoutThreshold: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects a non-URL appUrl", async () => {
    const { chain } = makeQueuedDb();
    const app = await getApp(chain);

    const res = await req(app, "PUT", "/admin/settings", { appUrl: "not-a-url" });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown/unexpected field instead of silently persisting it", async () => {
    const { chain } = makeQueuedDb();
    const app = await getApp(chain);

    const res = await req(app, "PUT", "/admin/settings", { updatedBy: "someone-else" });
    expect(res.status).toBe(400);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("rejects the wrong type for a boolean field", async () => {
    const { chain } = makeQueuedDb();
    const app = await getApp(chain);

    const res = await req(app, "PUT", "/admin/settings", { requireMfaForAll: "true" });
    expect(res.status).toBe(400);
  });

  it("accepts a valid multi-field update within bounds", async () => {
    const { chain } = makeQueuedDb();
    const app = await getApp(chain);

    const res = await req(app, "PUT", "/admin/settings", {
      sessionTTLSeconds: 7200,
      maxConcurrentSessions: 3,
      accountLockoutThreshold: 5,
      requireMfaForAll: true,
    });
    expect(res.status).toBe(200);
    expect(auditLog).toHaveBeenCalledWith(
      "admin.settings_updated",
      ADMIN_ID,
      "saas_settings",
      true,
      {
        changes: {
          sessionTTLSeconds: 7200,
          maxConcurrentSessions: 3,
          accountLockoutThreshold: 5,
          requireMfaForAll: true,
        },
      }
    );
  });

  it("still accepts a comma-separated allowedEmailDomains string", async () => {
    const { chain } = makeQueuedDb();
    const app = await getApp(chain);

    const res = await req(app, "PUT", "/admin/settings", {
      allowedEmailDomains: "example.com, acme.org",
    });
    expect(res.status).toBe(200);
    expect(auditLog).toHaveBeenCalled();
  });
});
