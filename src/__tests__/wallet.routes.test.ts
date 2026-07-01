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
  getWallet: vi.fn().mockResolvedValue({ balance: 100, lifetimeBalance: 200, currency: "usd", autoTopUp: false }),
  getWalletTransactions: vi.fn().mockResolvedValue([]),
  topUpWallet: vi.fn().mockResolvedValue({ balance: 150, transactionId: "tx-1" }),
  spendFromWallet: vi.fn().mockResolvedValue({ balance: 50, transactionId: "tx-2" }),
  countWalletTransactions: vi.fn().mockResolvedValue(0),
}));

import walletRoutes from "../api/routes/wallet.routes";

function app() {
  const a = new Hono();
  a.route("/wallet", walletRoutes);
  return a;
}

beforeEach(() => vi.clearAllMocks());

describe("wallet routes", () => {
  it("GET /wallet returns wallet balance", async () => {
    const res = await app().request("/wallet", {
      headers: { "x-test-user-id": "user-1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance).toBe(100);
  });

  it("GET /wallet/transactions returns paginated transactions", async () => {
    const res = await app().request("/wallet/transactions", {
      headers: { "x-test-user-id": "user-1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });

  it("POST /wallet/top-up adds funds", async () => {
    const res = await app().request("/wallet/top-up", {
      method: "POST",
      headers: { "x-test-user-id": "user-1", "content-type": "application/json" },
      body: JSON.stringify({ amount: 50 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance).toBe(150);
  });

  it("POST /wallet/spend deducts funds", async () => {
    const res = await app().request("/wallet/spend", {
      method: "POST",
      headers: { "x-test-user-id": "user-1", "content-type": "application/json" },
      body: JSON.stringify({ amount: 50, description: "test spend" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance).toBe(50);
  });

  it("requires authentication", async () => {
    const res = await app().request("/wallet");
    expect(res.status).toBe(401);
  });
});
