import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fresh permission-enforcement coverage for the rewritten org module. The prior
// org.routes.test.ts was deleted alongside the org-routes rewrite on main,
// leaving this RBAC surface (owner/admin/member tiers) untested. These tests
// lock the authorization boundaries back down.

vi.mock("../db", () => ({ getDb: vi.fn(), getReadDb: vi.fn() }));

vi.mock("../db/repositories/orgs.repository", () => ({
  createOrganizationWithOwner: vi.fn(),
  transferOrganizationOwnership: vi.fn(),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Stubbed so requests authenticate via `x-test-user-id`; omit it → 401.
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    const uid = c.req.header("x-test-user-id");
    if (!uid) return c.json({ error: "TOKEN_INVALID" }, 401);
    c.set("user", { id: uid, email: `${uid}@example.com`, roles: ["user"] });
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

function req(app: Hono, path: string, opts: { method?: string; uid?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.uid) headers["x-test-user-id"] = opts.uid;
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

const membership = (role: string) => [{ orgId: ORG, userId: OWNER, role }];

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
    db.limit.mockResolvedValueOnce(membership("member"));
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
    db.limit.mockResolvedValueOnce(membership("member"));
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
    db.limit.mockResolvedValueOnce(membership("member"));
    const app = await getRouter();
    const res = await req(app, `/${ORG}`, { method: "PUT", uid: MEMBER, body: { name: "New" } });
    expect(res.status).toBe(403);
  });

  it("lets an admin update the org", async () => {
    db.limit.mockResolvedValueOnce(membership("admin"));
    db.returning.mockResolvedValueOnce([{ id: ORG, name: "New" }]);
    const app = await getRouter();
    const res = await req(app, `/${ORG}`, { method: "PUT", uid: ADMIN, body: { name: "New" } });
    expect(res.status).toBe(200);
    expect((await res.json()).org.name).toBe("New");
  });

  it("403s a viewer from creating an invite", async () => {
    db.limit.mockResolvedValueOnce(membership("viewer"));
    const app = await getRouter();
    const res = await req(app, `/${ORG}/invites`, {
      method: "POST",
      uid: MEMBER,
      body: { email: "x@example.com", role: "member" },
    });
    expect(res.status).toBe(403);
  });

  it("lets an admin create an invite", async () => {
    db.limit.mockResolvedValueOnce(membership("admin"));
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
    db.limit.mockResolvedValueOnce(membership("admin"));
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
    db.limit.mockResolvedValueOnce(membership("admin"));
    readDb.limit.mockResolvedValueOnce([]);
    const { getReadDb } = await import("../db");
    vi.mocked(getReadDb).mockReturnValue(readDb as any);
    const app = await getRouter();

    const res = await req(app, `/${ORG}/invites`, { uid: ADMIN });

    expect(res.status).toBe(200);
    expect(getReadDb).toHaveBeenCalledTimes(1);
  });
});

describe("org RBAC — owner tier", () => {
  it("403s an admin (non-owner) from deleting the org", async () => {
    db.limit.mockResolvedValueOnce(membership("admin"));
    const app = await getRouter();
    const res = await req(app, `/${ORG}`, { method: "DELETE", uid: ADMIN });
    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("lets the owner delete the org", async () => {
    db.limit.mockResolvedValueOnce(membership("owner"));
    const app = await getRouter();
    const res = await req(app, `/${ORG}`, { method: "DELETE", uid: OWNER });
    expect(res.status).toBe(200);
    expect(db.delete).toHaveBeenCalled();
  });

  it("403s a non-owner from transferring ownership", async () => {
    db.limit.mockResolvedValueOnce(membership("admin"));
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
    db.limit.mockResolvedValueOnce(membership("member")); // current user
    const app = await getRouter();
    const res = await req(app, `/${ORG}/members/${ADMIN}`, { method: "DELETE", uid: MEMBER });
    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("refuses to remove the owner even when requested by the owner", async () => {
    db.limit
      .mockResolvedValueOnce(membership("owner")) // current user
      .mockResolvedValueOnce(membership("owner")); // target is also owner
    const app = await getRouter();
    const res = await req(app, `/${ORG}/members/${OWNER}`, { method: "DELETE", uid: OWNER });
    expect(res.status).toBe(403);
    expect((await res.json()).message).toMatch(/owner/i);
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
});
