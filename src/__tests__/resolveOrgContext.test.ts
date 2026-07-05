import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { HonoEnv, User } from "../shared/types";

const verifyOrgMembership = vi.fn();
const setSessionActiveOrg = vi.fn();

vi.mock("../db/orgMembership", () => ({
  verifyOrgMembership,
}));

vi.mock("../db/repositories/authSessions.repository", () => ({
  setSessionActiveOrg,
}));

function testUser(): User {
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
  };
}

describe("orgIdHintFromRequest", () => {
  it("prefers :orgId path param over query and header", async () => {
    const { orgIdHintFromRequest } = await import("../db/resolveOrgContext");
    const app = new Hono<HonoEnv>();
    app.get("/orgs/:orgId", (c) => c.json({ orgId: orgIdHintFromRequest(c, true) }));

    const res = await app.request("/orgs/path-org?orgId=query-org", {
      headers: { "x-org-id": "header-org" },
    });
    expect((await res.json()) as { orgId: string }).toEqual({ orgId: "path-org" });
  });

  it("reads orgId query when allowQuery is true", async () => {
    const { orgIdHintFromRequest } = await import("../db/resolveOrgContext");
    const app = new Hono<HonoEnv>();
    app.get("/search", (c) => c.json({ orgId: orgIdHintFromRequest(c, true) }));

    const res = await app.request("/search?orgId=query-org");
    expect((await res.json()) as { orgId: string }).toEqual({ orgId: "query-org" });
  });
});

describe("resolveAndSetActiveOrg", () => {
  beforeEach(() => {
    verifyOrgMembership.mockReset();
    setSessionActiveOrg.mockReset();
  });

  it("uses session activeOrgId as authoritative", async () => {
    verifyOrgMembership.mockResolvedValue(true);
    const { resolveAndSetActiveOrg } = await import("../db/resolveOrgContext");
    const app = new Hono<HonoEnv>();
    let activeOrgId: string | undefined;
    app.get("/orgs/:orgId", async (c) => {
      await resolveAndSetActiveOrg(c, testUser(), {
        id: "session-1",
        activeOrgId: "session-org",
      });
      activeOrgId = c.get("activeOrgId");
      return c.json({ ok: true });
    });

    await app.request("/orgs/spoofed-org", { headers: { "x-org-id": "header-org" } });
    expect(activeOrgId).toBe("session-org");
    expect(setSessionActiveOrg).not.toHaveBeenCalled();
  });

  it("bootstraps from validated hint when session has no active org", async () => {
    verifyOrgMembership.mockResolvedValue(true);
    setSessionActiveOrg.mockResolvedValue(true);
    const { resolveAndSetActiveOrg } = await import("../db/resolveOrgContext");
    const app = new Hono<HonoEnv>();
    let activeOrgId: string | undefined;
    app.get("/orgs/:orgId", async (c) => {
      await resolveAndSetActiveOrg(c, testUser(), { id: "session-1", activeOrgId: null });
      activeOrgId = c.get("activeOrgId");
      return c.json({ ok: true });
    });

    await app.request("/orgs/path-org");
    expect(activeOrgId).toBe("path-org");
    expect(setSessionActiveOrg).toHaveBeenCalledWith({
      sessionId: "session-1",
      orgId: "path-org",
      userId: "user-1",
      user: expect.objectContaining({ id: "user-1" }),
    });
  });

  it("clears stale session org when membership is revoked", async () => {
    verifyOrgMembership.mockResolvedValue(false);
    setSessionActiveOrg.mockResolvedValue(true);
    const { resolveAndSetActiveOrg } = await import("../db/resolveOrgContext");
    const app = new Hono<HonoEnv>();
    let activeOrgId: string | undefined;
    app.get("/", async (c) => {
      await resolveAndSetActiveOrg(c, testUser(), {
        id: "session-1",
        activeOrgId: "stale-org",
      });
      activeOrgId = c.get("activeOrgId");
      return c.json({ ok: true });
    });

    await app.request("/");
    expect(activeOrgId).toBeUndefined();
    expect(setSessionActiveOrg).toHaveBeenCalledWith({
      sessionId: "session-1",
      orgId: null,
      userId: "user-1",
      user: expect.objectContaining({ id: "user-1" }),
    });
  });
});
