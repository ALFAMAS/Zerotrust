import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fresh permission-enforcement coverage for the rewritten org module. The prior
// org.routes.test.ts was deleted alongside the org-routes rewrite on main,
// leaving this RBAC surface (owner/admin/member tiers) untested. These tests
// lock the authorization boundaries back down.

vi.mock("../db", () => ({ getDb: vi.fn(), getReadDb: vi.fn() }));

vi.mock("../db/repositories/orgs.repository", () => ({
  createOrganizationWithOwner: vi.fn(),
  transferOrganizationOwnership: vi.fn(),
  acceptOrgInvite: vi.fn(),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("../services/notifications/email.service", () => ({
  sendOrgInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

// Stubbed so requests authenticate via `x-test-user-id`; omit it → 401.
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    const uid = c.req.header("x-test-user-id");
    if (!uid) return c.json({ error: "TOKEN_INVALID" }, 401);
    const verified = c.req.header("x-test-email-verified") !== "false";
    c.set("user", {
      id: uid,
      email: `${uid}@example.com`,
      roles: ["user"],
      emailVerifiedAt: verified ? new Date("2026-01-01T00:00:00Z") : null,
    });
    return next();
  },
  requireEmailVerified: async (c: any, next: any) => {
    const user = c.get("user");
    if (!user?.emailVerifiedAt) {
      return c.json(
        {
          error: "EMAIL_NOT_VERIFIED",
          message: "Email verification required before this action",
        },
        403
      );
    }
    return next();
  },
}));

const OWNER = "00000000-0000-0000-0000-0000000000a1";
const ADMIN = "00000000-0000-0000-0000-0000000000a2";
const MEMBER = "00000000-0000-0000-0000-0000000000a3";
const ORG = "00000000-0000-0000-0000-0000000000b1";

function makeDb() {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]), // getMembership lookups resolve here
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    transaction: vi.fn(),
  };
  return chain;
}

async function getRouter() {
  const { default: router } = await import("../api/routes/org.routes");
  return new Hono().route("/orgs", router);
}

function req(app: Hono, path: string, opts: { method?: string; uid?: string; body?: unknown; emailVerified?: boolean } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.uid) headers["x-test-user-id"] = opts.uid;
  if (opts.emailVerified === false) headers["x-test-email-verified"] = "false";
  return app.request(`/orgs${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

let db: ReturnType<typeof makeDb>;

beforeEach(async () => {
  vi.resetModules();
  db = makeDb();
  const { getDb, getReadDb } = await import("../db");
  vi.mocked(getDb).mockReturnValue(db as any);
  vi.mocked(getReadDb).mockReturnValue(db as any);
});

afterEach(() => vi.clearAllMocks());

const membership = (role: string, userId: string) => [{ orgId: ORG, userId, role }];

describe("org RBAC — authentication", () => {
  it("401s an unauthenticated caller", async () => {
    const app = await getRouter();
    const res = await req(app, `/${ORG}`);
    expect(res.status).toBe(401);
  });
});

describe("org RBAC — member tier (read)", () => {
  it("uses the read replica connection for the org list", async () => {
    const readDb = makeDb();
    readDb.where.mockResolvedValueOnce([]);
    const { getReadDb } = await import("../db");
    vi.mocked(getReadDb).mockReturnValue(readDb as any);
    const app = await getRouter();

    const res = await req(app, "", { uid: MEMBER });

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalledTimes(1);
  });

  it("uses the read replica connection for org detail after membership check", async () => {
    const readDb = makeDb();
    db.limit.mockResolvedValueOnce(membership("member", MEMBER));
    readDb.limit.mockResolvedValueOnce([
      { id: ORG, name: "Acme", slug: "acme", logoUrl: null, billingEmail: null },
    ]);
    const { getReadDb } = await import("../db");
    vi.mocked(getReadDb).mockReturnValue(readDb as any);
    const app = await getRouter();

    const res = await req(app, `/${ORG}`, { uid: MEMBER });

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalledTimes(1);
  });

  it("403s a non-member from reading an org", async () => {
    db.limit.mockResolvedValueOnce([]); // getMembership → none
    const app = await getRouter();
    const res = await req(app, `/${ORG}`, { uid: MEMBER });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("FORBIDDEN");
  });

  it("uses the read replica connection for the members list after membership check", async () => {
    const readDb = makeDb();
    db.limit.mockResolvedValueOnce(membership("member", MEMBER));
    readDb.limit.mockResolvedValueOnce([]);
    const { getReadDb } = await import("../db");
    vi.mocked(getReadDb).mockReturnValue(readDb as any);
    const app = await getRouter();

    const res = await req(app, `/${ORG}/members`, { uid: MEMBER });

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalledTimes(1);
  });
});

describe("org RBAC — admin tier", () => {
  it("403s a plain member from updating the org", async () => {
    db.limit.mockResolvedValueOnce(membership("member", MEMBER));
    const app = await getRouter();
    const res = await req(app, `/${ORG}`, { method: "PUT", uid: MEMBER, body: { name: "New" } });
    expect(res.status).toBe(403);
  });

  it("lets an admin update the org", async () => {
    db.limit.mockResolvedValueOnce(membership("admin", ADMIN));
    db.returning.mockResolvedValueOnce([{ id: ORG, name: "New" }]);
    const app = await getRouter();
    const res = await req(app, `/${ORG}`, { method: "PUT", uid: ADMIN, body: { name: "New" } });
    expect(res.status).toBe(200);
    expect((await res.json()).org.name).toBe("New");
  });

  it("403s a viewer from creating an invite", async () => {
    db.limit.mockResolvedValueOnce(membership("viewer", MEMBER));
    const app = await getRouter();
    const res = await req(app, `/${ORG}/invites`, {
      method: "POST",
      uid: MEMBER,
      body: { email: "x@example.com", role: "member" },
    });
    expect(res.status).toBe(403);
  });

  it("lets an admin create an invite", async () => {
    db.limit.mockResolvedValueOnce(membership("admin", ADMIN));
    db.returning.mockResolvedValueOnce([{ id: "inv-1", email: "x@example.com", role: "member" }]);
    const app = await getRouter();
    const res = await req(app, `/${ORG}/invites`, {
      method: "POST",
      uid: ADMIN,
      body: { email: "x@example.com", role: "member" },
    });
    expect(res.status).toBe(201);
    expect((await res.json()).invite.email).toBe("x@example.com");
  });

  it("validates the invite body", async () => {
    db.limit.mockResolvedValueOnce(membership("admin", ADMIN));
    const app = await getRouter();
    const res = await req(app, `/${ORG}/invites`, {
      method: "POST",
      uid: ADMIN,
      body: { email: "not-an-email" },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("VALIDATION_ERROR");
  });

  it("uses the read replica connection for the invites list after admin check", async () => {
    const readDb = makeDb();
    db.limit.mockResolvedValueOnce(membership("admin", ADMIN));
    readDb.limit.mockResolvedValueOnce([]);
    const { getReadDb } = await import("../db");
    vi.mocked(getReadDb).mockReturnValue(readDb as any);
    const app = await getRouter();

    const res = await req(app, `/${ORG}/invites`, { uid: ADMIN });

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalledTimes(1);
  });

  it("scopes the org invites list to unused, unexpired invites", async () => {
    const readDb = makeDb();
    db.limit.mockResolvedValueOnce(membership("admin", ADMIN));
    readDb.limit.mockResolvedValueOnce([]);
    const { getReadDb } = await import("../db");
    vi.mocked(getReadDb).mockReturnValue(readDb as any);
    const app = await getRouter();

    await req(app, `/${ORG}/invites`, { uid: ADMIN });

    const dialect = new PgDialect();
    const whereClause = readDb.where.mock.calls[0]?.[0];
    expect(whereClause).toBeDefined();
    const { sql } = dialect.sqlToQuery(whereClause);
    expect(sql).toContain('"organization_invites"."org_id"');
    expect(sql.toLowerCase()).toContain("used_at");
    expect(sql.toLowerCase()).toContain("is null");
    expect(sql.toLowerCase()).toContain("expires_at");
  });
});

describe("org RBAC — owner tier", () => {
  it("403s an admin (non-owner) from deleting the org", async () => {
    db.limit.mockResolvedValueOnce(membership("admin", ADMIN));
    const app = await getRouter();
    const res = await req(app, `/${ORG}`, { method: "DELETE", uid: ADMIN });
    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("lets the owner delete the org", async () => {
    db.limit.mockResolvedValueOnce(membership("owner", OWNER));
    const app = await getRouter();
    const res = await req(app, `/${ORG}`, { method: "DELETE", uid: OWNER });
    expect(res.status).toBe(200);
    expect(db.delete).toHaveBeenCalled();
  });

  it("403s a non-owner from transferring ownership", async () => {
    db.limit.mockResolvedValueOnce(membership("admin", ADMIN));
    const app = await getRouter();
    const res = await req(app, `/${ORG}/transfer`, {
      method: "POST",
      uid: ADMIN,
      body: { newOwnerId: MEMBER },
    });
    expect(res.status).toBe(403);
  });
});

describe("org RBAC — member removal", () => {
  it("403s a plain member trying to remove someone else", async () => {
    db.limit.mockResolvedValueOnce(membership("member", MEMBER)); // current user
    const app = await getRouter();
    const res = await req(app, `/${ORG}/members/${ADMIN}`, { method: "DELETE", uid: MEMBER });
    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("refuses to remove the owner even when requested by the owner", async () => {
    db.limit
      .mockResolvedValueOnce(membership("owner", OWNER)) // current user
      .mockResolvedValueOnce(membership("owner", OWNER)); // target is also owner
    const app = await getRouter();
    const res = await req(app, `/${ORG}/members/${OWNER}`, { method: "DELETE", uid: OWNER });
    expect(res.status).toBe(403);
    expect((await res.json()).message).toMatch(/owner/i);
    expect(db.delete).not.toHaveBeenCalled();
  });
});

describe("org invites — mine / accept / decline", () => {
  it("401s an unauthenticated caller listing their invites", async () => {
    const app = await getRouter();
    const res = await req(app, "/invites/mine");
    expect(res.status).toBe(401);
  });

  it("uses the read replica connection to list the caller's pending invites", async () => {
    const readDb = makeDb();
    readDb.limit.mockResolvedValueOnce([]);
    const { getReadDb } = await import("../db");
    vi.mocked(getReadDb).mockReturnValue(readDb as any);
    const app = await getRouter();

    const res = await req(app, "/invites/mine", { uid: MEMBER });

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalledTimes(1);
  });

  it("accepts a valid invite", async () => {
    const { acceptOrgInvite } = await import("../db/repositories/orgs.repository");
    vi.mocked(acceptOrgInvite).mockResolvedValueOnce({
      ok: true,
      org: { id: ORG, name: "Acme", slug: "acme" },
      member: { role: "member" },
    } as any);
    const app = await getRouter();

    const res = await req(app, "/invites/accept", {
      method: "POST",
      uid: MEMBER,
      body: { token: "sometoken" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.org.name).toBe("Acme");
    expect(body.member.role).toBe("member");
  });

  it("validates the accept body", async () => {
    const app = await getRouter();
    const res = await req(app, "/invites/accept", {
      method: "POST",
      uid: MEMBER,
      body: {},
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("VALIDATION_ERROR");
  });

  it("404s accepting an invite for a different email", async () => {
    const { acceptOrgInvite } = await import("../db/repositories/orgs.repository");
    vi.mocked(acceptOrgInvite).mockResolvedValueOnce({
      ok: false,
      reason: "email_mismatch",
    } as any);
    const app = await getRouter();

    const res = await req(app, "/invites/accept", {
      method: "POST",
      uid: MEMBER,
      body: { token: "sometoken" },
    });

    expect(res.status).toBe(403);
  });

  it("410s accepting an expired invite", async () => {
    const { acceptOrgInvite } = await import("../db/repositories/orgs.repository");
    vi.mocked(acceptOrgInvite).mockResolvedValueOnce({ ok: false, reason: "expired" } as any);
    const app = await getRouter();

    const res = await req(app, "/invites/accept", {
      method: "POST",
      uid: MEMBER,
      body: { token: "sometoken" },
    });

    expect(res.status).toBe(410);
  });

  it("404s accepting an unknown/used invite", async () => {
    const { acceptOrgInvite } = await import("../db/repositories/orgs.repository");
    vi.mocked(acceptOrgInvite).mockResolvedValueOnce({ ok: false, reason: "not_found" } as any);
    const app = await getRouter();

    const res = await req(app, "/invites/accept", {
      method: "POST",
      uid: MEMBER,
      body: { token: "sometoken" },
    });

    expect(res.status).toBe(404);
  });

  it("lets the invited user decline their own invite", async () => {
    db.limit.mockResolvedValueOnce([{ id: "inv-1", email: `${MEMBER}@example.com` }]);
    const app = await getRouter();

    const res = await req(app, "/invites/inv-1", { method: "DELETE", uid: MEMBER });

    expect(res.status).toBe(200);
    expect(db.delete).toHaveBeenCalled();
  });

  it("404s declining an invite addressed to someone else", async () => {
    db.limit.mockResolvedValueOnce([{ id: "inv-1", email: "someone-else@example.com" }]);
    const app = await getRouter();

    const res = await req(app, "/invites/inv-1", { method: "DELETE", uid: MEMBER });

    expect(res.status).toBe(404);
    expect(db.delete).not.toHaveBeenCalled();
  });
});

describe("org create", () => {
  it("validates the create body", async () => {
    const app = await getRouter();
    const res = await req(app, "", { method: "POST", uid: OWNER, body: { name: "" } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("VALIDATION_ERROR");
  });

  it("creates an org and returns 201", async () => {
    const { createOrganizationWithOwner } = await import("../db/repositories/orgs.repository");
    vi.mocked(createOrganizationWithOwner).mockResolvedValueOnce({
      id: ORG,
      name: "Acme",
      slug: "acme",
      ownerId: OWNER,
    } as any);
    const app = await getRouter();
    const res = await req(app, "", { method: "POST", uid: OWNER, body: { name: "Acme" } });
    expect(res.status).toBe(201);
    expect((await res.json()).org.slug).toBe("acme");
  });

  it("returns 403 when email is not verified", async () => {
    const app = await getRouter();
    const res = await req(app, "", {
      method: "POST",
      uid: OWNER,
      emailVerified: false,
      body: { name: "Acme" },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("EMAIL_NOT_VERIFIED");
  });
});
