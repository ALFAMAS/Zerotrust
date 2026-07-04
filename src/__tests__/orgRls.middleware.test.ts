import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { HonoEnv, User } from "../shared/types";

const verifyOrgMembership = vi.fn();
const withOrgRls = vi.fn(async (_ctx: unknown, fn: (tx: unknown) => unknown) => {
  const tx = { execute: vi.fn() };
  return fn(tx);
});

vi.mock("../db/resolveOrgContext", () => ({
  orgIdFromRequest: vi.fn((c: { req: { header: (n: string) => string | undefined } }) =>
    c.req.header("x-org-id")
  ),
  shouldBypassOrgRls: vi.fn(() => false),
  verifyOrgMembership,
}));

vi.mock("../db/rls", () => ({
  withOrgRls,
}));

function testUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "u@example.com",
    displayName: "User",
    roles: ["user"],
    attributes: {},
    mfa: { totp: { enabled: false, backupCodes: [] }, webauthn: { enabled: false } },
    passkeys: [],
    oauthProviders: [],
    status: "active",
    subUserIds: [],
    sessionConfig: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("orgRlsMiddleware", () => {
  beforeEach(() => {
    verifyOrgMembership.mockReset();
    withOrgRls.mockClear();
    verifyOrgMembership.mockResolvedValue(true);
  });

  it("wraps handler in withOrgRls when X-Org-Id is present", async () => {
    const { orgRlsMiddleware } = await import("../middleware/orgRls");
    const app = new Hono<HonoEnv>();
    app.use("*", async (c, next) => {
      c.set("user", testUser());
      await next();
    });
    app.use("*", orgRlsMiddleware());
    app.get("/", (c) => c.json({ ok: true, hasTx: Boolean(c.get("dbTx")) }));

    const res = await app.request("/", { headers: { "x-org-id": "org-1" } });
    expect(res.status).toBe(200);
    expect(withOrgRls).toHaveBeenCalledWith(
      { orgId: "org-1", userId: "user-1" },
      expect.any(Function)
    );
    const body = (await res.json()) as { hasTx: boolean };
    expect(body.hasTx).toBe(true);
  });

  it("passes through when no org context", async () => {
    const { orgRlsMiddleware } = await import("../middleware/orgRls");
    const app = new Hono<HonoEnv>();
    app.use("*", async (c, next) => {
      c.set("user", testUser());
      await next();
    });
    app.use("*", orgRlsMiddleware());
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(withOrgRls).not.toHaveBeenCalled();
  });
});
