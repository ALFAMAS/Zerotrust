import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
// globalization.routes.ts imports with EXTENSIONLESS specifiers (../../db,
// ...), so mock specifier strings here must be extensionless too (../db, ...).

// Two DISTINCT db instances so we can prove which connection the
// authorization checks (isOrgMember / canManageOrg) actually query — M13's
// fix changed both from getReadDb() to getDb().
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
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ and: args })),
  eq: vi.fn((col, val) => ({ eq: [col, val] })),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const CALLER_ID = "00000000-0000-0000-0000-000000000001";
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", { id: CALLER_ID, email: "caller@example.com", roles: ["user"] });
    return next();
  },
}));

vi.mock("../services/billing/globalization.service", () => ({
  calculateTax: vi.fn(),
  getExchangeRates: vi.fn(),
  getLocalizedPricing: vi.fn(),
  isSupportedCurrency: vi.fn(),
  pppForCountry: vi.fn(),
  SUPPORTED_CURRENCIES: ["usd"],
  validateVatNumber: vi.fn(),
}));

const listTaxExemptions = vi.fn().mockResolvedValue([]);
vi.mock("../services/billing/taxExemption.service", () => ({
  hasVerifiedExemption: vi.fn(),
  isReverseCharge: vi.fn(),
  listTaxExemptions: (...a: unknown[]) => listTaxExemptions(...a),
  setExemptionStatus: vi.fn(),
  submitTaxExemption: vi.fn(),
}));

const ORG_ID = "00000000-0000-0000-0000-0000000000b1";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  listTaxExemptions.mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

async function getApp() {
  const { default: router } = await import("../api/routes/globalization.routes");
  return new Hono().route("/billing", router);
}

describe("globalization.routes — isOrgMember reads the primary (M13)", () => {
  it("queries getDb() for the membership check and succeeds using its data", async () => {
    primary = makeChain("primary", [{ role: "member" }]);
    replica = makeChain("replica", []); // would deny if the check mistakenly used this

    const app = await getApp();
    const res = await app.request(`/billing/tax-exemptions?orgId=${ORG_ID}`, {
      headers: { "x-test": "1" },
    });

    expect(res.status).not.toBe(403);
    expect(primary.calls.length).toBeGreaterThan(0);
  });

  it("denies access using the primary's current membership, not stale replica data", async () => {
    // Primary reflects a just-removed member (no row); replica is stale and
    // would still show membership — if the check used the replica, this
    // request would be wrongly authorized.
    primary = makeChain("primary", []);
    replica = makeChain("replica", [{ role: "member" }]);

    const app = await getApp();
    const res = await app.request(`/billing/tax-exemptions?orgId=${ORG_ID}`, {
      headers: { "x-test": "1" },
    });

    expect(res.status).toBe(403);
  });
});
