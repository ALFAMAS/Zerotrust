import { describe, it, expect, vi, afterEach } from "vitest";
import { Hono } from "hono";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../config", () => ({
  getConfig: () => ({
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
    security: {
      bcryptRounds: 4,
      tokenSecretHex: "a".repeat(64),
      csfleMasterKeyHex: "b".repeat(64),
      csflekeyRotationIntervalDays: 90,
    },
    rateLimiting: { enabled: false, perIpLimit: 100, windowSecs: 60 },
    geofencing: { enabled: false, allowedCountries: [], allowedIpRanges: [] },
    mfa: {
      totpWindow: 1,
      otpExpirySecs: 900,
      maxOTPAttempts: 5,
      channels: {
        email: { enabled: true },
        sms: { enabled: false, provider: "twilio" },
        whatsapp: { enabled: false, provider: "twilio" },
        telegram: { enabled: false, botToken: "" },
      },
    },
    oauth: { providers: {} },
    elasticsearch: { enabled: false, host: "localhost", port: 9200, indexPrefix: "zeroauth" },
    logging: { level: "error", format: "json" },
  }),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// The per-org IP-allowlist middleware loads the policy via this service. Mock it
// so it doesn't consume the hand-sequenced db chain in unrelated tests; default
// to no restriction. Individual tests override it to exercise allowlist denial.
vi.mock("../services/orgSecurityPolicy.service", () => ({
  getOrgSecurityPolicy: vi.fn().mockResolvedValue({ ipAllowlist: [] }),
}));

// ── Constants ──────────────────────────────────────────────────────────────

const USER_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_USER_ID = "00000000-0000-0000-0000-000000000002";
const ORG_ID = "00000000-0000-0000-0000-000000000010";
const MEMBER_ID = "00000000-0000-0000-0000-000000000020";
const INVITE_ID = "00000000-0000-0000-0000-000000000030";

// ── DB chain helper ────────────────────────────────────────────────────────

function makeDbChain(returnValue: any = []) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    innerJoin: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    and: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    isNull: vi.fn().mockReturnThis(),
  };
  return chain;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: ORG_ID,
    name: "Acme Corp",
    slug: "acme-corp",
    logoUrl: null,
    billingEmail: null,
    ownerId: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeOrgMember(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBER_ID,
    orgId: ORG_ID,
    userId: USER_ID,
    role: "owner",
    invitedBy: null,
    joinedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: INVITE_ID,
    orgId: ORG_ID,
    email: "alice@example.com",
    role: "member",
    token: "invite-token-32-chars-here-1234",
    invitedBy: USER_ID,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ── App factory ────────────────────────────────────────────────────────────

async function getApp(
  db: ReturnType<typeof makeDbChain>,
  userId = USER_ID,
  email = "alice@example.com"
) {
  vi.resetModules();

  const { getDb } = await import("../db");
  vi.mocked(getDb).mockReturnValue(db as any);

  vi.doMock("../middleware/auth", () => ({
    authMiddleware: async (c: any, next: any) => {
      c.set("user", { id: userId, email, roles: ["user"] });
      return next();
    },
  }));

  const { default: router } = await import("../api/routes/org.routes");
  return new Hono().route("/", router);
}

// ── POST / ─────────────────────────────────────────────────────────────────

describe("POST / (create org)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../middleware/auth");
  });

  it("returns 201 with org and owner member on success", async () => {
    const db = makeDbChain([]);
    // slug uniqueness check → no existing org
    db.limit.mockResolvedValueOnce([]);
    // insert org returning
    db.returning.mockResolvedValueOnce([makeOrg()]);
    // insert member returning
    db.returning.mockResolvedValueOnce([makeOrgMember()]);

    const app = await getApp(db);
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme Corp", slug: "acme-corp" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.org.id).toBe(ORG_ID);
    expect(body.member.role).toBe("owner");
  });

  it("returns 409 when slug is already in use", async () => {
    const db = makeDbChain([]);
    // slug uniqueness check → conflict
    db.limit.mockResolvedValueOnce([makeOrg()]);

    const app = await getApp(db);
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme Corp", slug: "acme-corp" }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("SLUG_CONFLICT");
  });

  it("returns 400 when name is missing", async () => {
    const db = makeDbChain([]);
    const app = await getApp(db);
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "acme" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_REQUEST");
  });

  it("returns 400 for invalid slug format", async () => {
    const db = makeDbChain([]);
    const app = await getApp(db);
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", slug: "AB" }), // too short + uppercase
    });

    expect(res.status).toBe(400);
  });

  it("auto-generates slug from name when slug not provided", async () => {
    const db = makeDbChain([]);
    db.limit.mockResolvedValueOnce([]);
    db.returning.mockResolvedValueOnce([makeOrg({ slug: "acme-corp" })]);
    db.returning.mockResolvedValueOnce([makeOrgMember()]);

    const capturedValues: any[] = [];
    db.values.mockImplementation((v: any) => {
      capturedValues.push(v);
      return db;
    });

    const app = await getApp(db);
    await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme Corp" }),
    });

    // First values() call is the org insert; slug should be auto-generated
    expect(capturedValues[0]?.slug).toBe("acme-corp");
  });
});

// ── GET / ──────────────────────────────────────────────────────────────────

describe("GET / (list user orgs)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../middleware/auth");
  });

  it("returns only orgs the current user is a member of", async () => {
    const db = makeDbChain([]);
    const rows = [{ org: makeOrg(), member: makeOrgMember() }];
    // GET / query: .select().from().innerJoin().where() — terminal call is .where()
    db.where.mockResolvedValueOnce(rows);

    const app = await getApp(db);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.orgs)).toBe(true);
  });

  it("returns empty list when user has no orgs", async () => {
    const db = makeDbChain([]);
    // GET / query terminates at .where()
    db.where.mockResolvedValueOnce([]);

    const app = await getApp(db);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orgs).toHaveLength(0);
  });
});

// ── POST /:orgId/invites ───────────────────────────────────────────────────

describe("POST /:orgId/invites", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../middleware/auth");
  });

  it("creates an invite and returns 201 for an admin", async () => {
    const db = makeDbChain([]);
    // requireOrgRole: member lookup → admin role
    db.limit.mockResolvedValueOnce([makeOrgMember({ role: "admin" })]);
    // insert invite returning
    db.returning.mockResolvedValueOnce([makeInvite()]);

    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com", role: "member" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invite).toBeDefined();
  });

  it("returns 403 when caller is only a member (not admin)", async () => {
    const db = makeDbChain([]);
    // requireOrgRole: member lookup → member role (insufficient)
    db.limit.mockResolvedValueOnce([makeOrgMember({ role: "member" })]);

    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 403 when caller is not a member at all", async () => {
    const db = makeDbChain([]);
    // requireOrgRole: no membership found
    db.limit.mockResolvedValueOnce([]);

    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com" }),
    });

    expect(res.status).toBe(403);
  });
});

// ── Org passkey security policy ──────────────────────────────────────────────

describe("GET /:orgId/security/policy", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../middleware/auth");
  });

  it("returns the stored policy for a viewer", async () => {
    const db = makeDbChain([]);
    db.limit.mockResolvedValueOnce([makeOrgMember({ role: "viewer" })]); // requireOrgRole
    db.limit.mockResolvedValueOnce([
      {
        orgId: ORG_ID,
        requirePasskeyAttestation: true,
        requireHardwarePasskey: true,
        allowedPasskeyAaguids: ["aaguid-1"],
        deniedPasskeyAaguids: [],
      },
    ]); // policy lookup

    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/security/policy`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.policy.requirePasskeyAttestation).toBe(true);
    expect(body.policy.requireHardwarePasskey).toBe(true);
  });

  it("returns permissive defaults when no policy is stored", async () => {
    const db = makeDbChain([]);
    db.limit.mockResolvedValueOnce([makeOrgMember({ role: "viewer" })]); // requireOrgRole
    db.limit.mockResolvedValueOnce([]); // no policy row

    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/security/policy`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.policy.requirePasskeyAttestation).toBe(false);
    expect(body.policy.requireHardwarePasskey).toBe(false);
  });

  it("returns 403 for a non-member", async () => {
    const db = makeDbChain([]);
    db.limit.mockResolvedValueOnce([]); // requireOrgRole → no membership
    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/security/policy`);
    expect(res.status).toBe(403);
  });
});

describe("PUT /:orgId/security/policy", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../middleware/auth");
  });

  it("upserts the policy for an admin", async () => {
    const db = makeDbChain([]);
    db.limit.mockResolvedValueOnce([makeOrgMember({ role: "admin" })]); // requireOrgRole
    const deniedAaguid = "ee882879-721c-4913-9775-3dfcce97072a";
    db.returning.mockResolvedValueOnce([
      {
        orgId: ORG_ID,
        requirePasskeyAttestation: true,
        requireHardwarePasskey: false,
        allowedPasskeyAaguids: [],
        deniedPasskeyAaguids: [deniedAaguid],
      },
    ]);

    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/security/policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requirePasskeyAttestation: true,
        requireHardwarePasskey: false,
        deniedPasskeyAaguids: [deniedAaguid],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.policy.requirePasskeyAttestation).toBe(true);
    expect(body.policy.deniedPasskeyAaguids).toContain(deniedAaguid);
  });

  it("rejects a malformed AAGUID with 400", async () => {
    const db = makeDbChain([]);
    db.limit.mockResolvedValueOnce([makeOrgMember({ role: "admin" })]); // requireOrgRole
    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/security/policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowedPasskeyAaguids: ["not-a-uuid"] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_REQUEST");
  });

  it("returns 403 when caller is only a member", async () => {
    const db = makeDbChain([]);
    db.limit.mockResolvedValueOnce([makeOrgMember({ role: "member" })]); // requireOrgRole
    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/security/policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirePasskeyAttestation: true }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects a malformed IP allowlist entry with 400", async () => {
    const db = makeDbChain([]);
    db.limit.mockResolvedValueOnce([makeOrgMember({ role: "admin" })]); // requireOrgRole
    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/security/policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ipAllowlist: ["10.0.0.0/8", "not-an-ip"] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_REQUEST");
  });

  it("persists a valid IP allowlist for an admin", async () => {
    const db = makeDbChain([]);
    db.limit.mockResolvedValueOnce([makeOrgMember({ role: "admin" })]); // requireOrgRole
    db.returning.mockResolvedValueOnce([
      { orgId: ORG_ID, ipAllowlist: ["203.0.113.0/24"] },
    ]);
    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/security/policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ipAllowlist: ["203.0.113.0/24"] }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).policy.ipAllowlist).toContain("203.0.113.0/24");
  });
});

describe("Per-org IP allowlist enforcement", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../middleware/auth");
  });

  it("blocks an org-scoped request from an IP outside the allowlist", async () => {
    const db = makeDbChain([]);
    const app = await getApp(db);
    // Override AFTER getApp — getApp resets modules, so the middleware uses the
    // service instance resolved post-reset.
    const { getOrgSecurityPolicy } = await import("../services/orgSecurityPolicy.service");
    vi.mocked(getOrgSecurityPolicy).mockResolvedValueOnce({ ipAllowlist: ["10.0.0.0/8"] } as any);

    const res = await app.request(`/${ORG_ID}`, {
      headers: { "x-forwarded-for": "203.0.113.5" },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ACCESS_DENIED_IP");
  });

  it("allows a request from an IP inside the allowlist", async () => {
    const db = makeDbChain([]);
    db.limit.mockResolvedValueOnce([makeOrgMember({ role: "viewer" })]); // requireOrgRole
    db.limit.mockResolvedValueOnce([makeOrg()]); // org lookup
    const app = await getApp(db);
    const { getOrgSecurityPolicy } = await import("../services/orgSecurityPolicy.service");
    vi.mocked(getOrgSecurityPolicy).mockResolvedValueOnce({ ipAllowlist: ["10.0.0.0/8"] } as any);

    const res = await app.request(`/${ORG_ID}`, {
      headers: { "x-forwarded-for": "10.1.2.3" },
    });
    // Passes the allowlist; reaches the handler (200 with org payload).
    expect(res.status).toBe(200);
  });
});

// ── POST /invites/accept ───────────────────────────────────────────────────

describe("POST /invites/accept", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../middleware/auth");
  });

  it("accepts invite, inserts member, marks invite used", async () => {
    const db = makeDbChain([]);
    const validInvite = makeInvite({ email: "alice@example.com" });

    // lookup invite by token
    db.limit.mockResolvedValueOnce([validInvite]);
    // check not already member
    db.limit.mockResolvedValueOnce([]);
    // insert member
    db.returning.mockResolvedValueOnce([makeOrgMember({ role: "member" })]);
    // update invite usedAt
    db.returning.mockResolvedValueOnce([{ ...validInvite, usedAt: new Date() }]);
    // get org
    db.limit.mockResolvedValueOnce([makeOrg()]);

    const app = await getApp(db, USER_ID, "alice@example.com");
    const res = await app.request("/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invite-token-32-chars-here-1234" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.member).toBeDefined();
    expect(body.org).toBeDefined();
  });

  it("returns 400 when invite token is expired", async () => {
    const db = makeDbChain([]);
    const expiredInvite = makeInvite({
      email: "alice@example.com",
      expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
    });

    db.limit.mockResolvedValueOnce([expiredInvite]);

    const app = await getApp(db, USER_ID, "alice@example.com");
    const res = await app.request("/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "expired-token" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVITE_EXPIRED");
  });

  it("returns 400 when invite has already been used", async () => {
    const db = makeDbChain([]);
    const usedInvite = makeInvite({
      email: "alice@example.com",
      usedAt: new Date(Date.now() - 60000),
    });

    db.limit.mockResolvedValueOnce([usedInvite]);

    const app = await getApp(db, USER_ID, "alice@example.com");
    const res = await app.request("/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "used-token" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVITE_USED");
  });

  it("returns 403 when invite email does not match current user email", async () => {
    const db = makeDbChain([]);
    const invite = makeInvite({ email: "other@example.com" });

    db.limit.mockResolvedValueOnce([invite]);

    // user is logged in as alice@example.com, but invite is for other@example.com
    const app = await getApp(db, USER_ID, "alice@example.com");
    const res = await app.request("/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "some-token" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("INVITE_EMAIL_MISMATCH");
  });
});

// ── DELETE /:orgId/members/:userId ─────────────────────────────────────────

describe("DELETE /:orgId/members/:userId", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../middleware/auth");
  });

  it("successfully removes a non-owner member when caller is admin", async () => {
    const db = makeDbChain([]);
    // requireOrgRole: caller is admin
    db.limit.mockResolvedValueOnce([makeOrgMember({ userId: USER_ID, role: "admin" })]);
    // target member lookup (not owner)
    db.limit.mockResolvedValueOnce([makeOrgMember({ userId: OTHER_USER_ID, role: "member" })]);
    // delete
    db.returning.mockResolvedValueOnce([]);

    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/members/${OTHER_USER_ID}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 403 when trying to remove the org owner", async () => {
    const db = makeDbChain([]);
    // requireOrgRole: caller is admin
    db.limit.mockResolvedValueOnce([makeOrgMember({ userId: USER_ID, role: "admin" })]);
    // target member lookup — is the owner
    db.limit.mockResolvedValueOnce([makeOrgMember({ userId: OTHER_USER_ID, role: "owner" })]);

    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/members/${OTHER_USER_ID}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("FORBIDDEN");
  });

  it("returns 403 when caller lacks admin role", async () => {
    const db = makeDbChain([]);
    // requireOrgRole: caller is only a member
    db.limit.mockResolvedValueOnce([makeOrgMember({ role: "member" })]);

    const app = await getApp(db);
    const res = await app.request(`/${ORG_ID}/members/${OTHER_USER_ID}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(403);
  });
});
