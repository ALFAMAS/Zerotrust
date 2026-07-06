import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
// billing.routes.ts imports with EXTENSIONLESS specifiers (../../db, ...),
// so mock specifier strings here must be extensionless too (../db, ...).

// Two DISTINCT db instances so we can prove which connection the
// authorization check (canManageOrgBilling) actually queries — M13's fix
// changed it from getReadDb() to getDb().
function makeChain(name: string, membershipRows: unknown[]) {
  const calls: string[] = [];
  const chain: any = {
    select: vi.fn().mockImplementation(() => {
      calls.push(name);
      return chain;
    }),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(membershipRows),
  };
  return { chain, calls };
}

let primary: ReturnType<typeof makeChain>;
let replica: ReturnType<typeof makeChain>;

vi.mock("../db", () => ({
  getDb: () => primary.chain,
  getReadDb: () => replica.chain,
}));

vi.mock("../db/schema", () => ({
  organizationMembersTable: { orgId: "org_id", userId: "user_id", role: "role" },
  subscriptionsTable: { orgId: "org_id", userId: "user_id" },
  feedbackTable: {},
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ and: args })),
  eq: vi.fn((col, val) => ({ eq: [col, val] })),
}));

vi.mock("../logger", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const CALLER_ID = "00000000-0000-0000-0000-000000000001";
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: CALLER_ID, email: "caller@example.com", roles: ["user"] });
    return next();
  },
  requireEmailVerified: async (_c: any, next: any) => next(),
}));

vi.mock("../middleware/continuousVerification", () => ({
  sensitiveReverification: async (_c: any, next: any) => next(),
}));

vi.mock("../middleware/orgRls", () => ({
  orgRlsMiddleware: () => async (_c: any, next: any) => next(),
}));

vi.mock("../services/billing/stripeWebhookProcessor", () => ({ getStripe: vi.fn() }));
vi.mock("../services/billing/usage.service", () => ({ getUsageSummary: vi.fn() }));
vi.mock("../db/repositories/billingSubscriptions.repository", () => ({
  reactivateSubscription: vi.fn(),
  scheduleSubscriptionCancellation: vi.fn(),
  setSubscriptionPaused: vi.fn(),
}));

const ORG_ID = "00000000-0000-0000-0000-0000000000b1";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => vi.clearAllMocks());

async function getApp() {
  const { default: router } = await import("../api/routes/billing.routes");
  return new Hono().route("/billing", router);
}

describe("billing.routes — canManageOrgBilling reads the primary (M13)", () => {
  it("queries getDb() for the authorization check, and succeeds using its data", async () => {
    primary = makeChain("primary", [{ role: "admin" }]);
    // findSubscription() legitimately uses getReadDb() afterward for the
    // actual data fetch — only the authorization check itself is under
    // test here, so the replica having no matching subscription is fine.
    replica = makeChain("replica", []);

    const app = await getApp();
    const res = await app.request(`/billing/subscription?orgId=${ORG_ID}`, {
      headers: { "x-test": "1" },
    });

    // Authorized using the primary's data (role: admin) → not a 403.
    expect(res.status).not.toBe(403);
    expect(primary.calls.length).toBeGreaterThan(0);
  });

  it("denies access using the primary's current membership, not stale replica data", async () => {
    // Primary reflects a just-demoted member (no row); replica is stale and
    // would still show them as admin — if the check used the replica, this
    // request would be wrongly authorized.
    primary = makeChain("primary", []);
    replica = makeChain("replica", [{ role: "admin" }]);

    const app = await getApp();
    const res = await app.request(`/billing/subscription?orgId=${ORG_ID}`, {
      headers: { "x-test": "1" },
    });

    expect(res.status).toBe(403);
  });
});
