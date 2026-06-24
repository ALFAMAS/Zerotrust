import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub auth: authenticate via x-test-user-id, mirroring the real middleware.
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    const uid = c.req.header("x-test-user-id");
    if (!uid) return c.json({ error: "TOKEN_INVALID" }, 401);
    c.set("user", { id: uid, email: "u@example.com", roles: ["user"] });
    await next();
  },
}));

vi.mock("../services/wallet.service", () => ({
  getWallet: vi.fn().mockResolvedValue({ balance: 100, tier: null }),
  getWalletTransactions: vi.fn().mockResolvedValue([]),
  topUpWallet: vi.fn(),
  spendFromWallet: vi.fn(),
  getPointsBalance: vi.fn(),
  getPointsHistory: vi.fn(),
  getCurrentTier: vi.fn().mockResolvedValue(null),
  getRedemptionCatalog: vi.fn(),
  redeemItem: vi.fn(),
  createReferralLink: vi.fn().mockResolvedValue({ code: "ABCD1234", slug: "my-link" }),
  getReferralDashboard: vi
    .fn()
    .mockResolvedValue({ totals: { clicks: 3, signups: 1, conversions: 1, rewards: 500 }, links: [] }),
  getReferralBySlug: vi.fn(),
  trackReferralClick: vi.fn(),
}));

import walletRoutes from "../api/routes/wallet.routes";
import { createReferralLink, getReferralDashboard } from "../services/wallet.service";

function app() {
  const a = new Hono();
  a.route("/wallet", walletRoutes);
  return a;
}

beforeEach(() => vi.clearAllMocks());

describe("wallet referral routes — correct paths", () => {
  it("GET /wallet/referrals/dashboard returns the dashboard (documented path)", async () => {
    const res = await app().request("/wallet/referrals/dashboard", {
      headers: { "x-test-user-id": "user-1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals.clicks).toBe(3);
    expect(getReferralDashboard).toHaveBeenCalledWith("user-1");
  });

  it("POST /wallet/referrals creates a referral link (documented path)", async () => {
    const res = await app().request("/wallet/referrals", {
      method: "POST",
      headers: { "x-test-user-id": "user-1", "content-type": "application/json" },
      body: JSON.stringify({ slug: "my-link" }),
    });
    expect(res.status).toBe(201);
    expect(createReferralLink).toHaveBeenCalledWith("user-1", "my-link");
  });

  it("the old mis-registered paths no longer resolve to referral handlers", async () => {
    // GET /wallet/dashboard used to be the dashboard; it must now 404 so the
    // route surface matches the README / generated SDK.
    const stale = await app().request("/wallet/dashboard", {
      headers: { "x-test-user-id": "user-1" },
    });
    expect(stale.status).toBe(404);
    expect(getReferralDashboard).not.toHaveBeenCalled();
  });

  it("still requires authentication", async () => {
    const res = await app().request("/wallet/referrals/dashboard");
    expect(res.status).toBe(401);
  });
});
