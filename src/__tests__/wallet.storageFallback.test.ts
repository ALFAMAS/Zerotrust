import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { getDb } from "../db";
import {
  getCurrentTier,
  getPointsBalance,
  getPointsHistory,
  getWallet,
  getWalletTransactions,
} from "../services/wallet.service";

function missingStorage(table: string) {
  return Object.assign(new Error(`relation "${table}" does not exist`), { code: "42P01" });
}

function selectChain(finalMethod: "limit" | "offset", result: unknown) {
  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
  };
  chain[finalMethod].mockImplementation(() => {
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  });

  return {
    select: vi.fn(() => chain),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("wallet storage fallbacks", () => {
  it("returns an empty wallet when wallet storage is unavailable", async () => {
    vi.mocked(getDb).mockReturnValue(selectChain("limit", missingStorage("wallets")) as any);

    await expect(getWallet("user-1")).resolves.toEqual({
      balance: 0,
      lifetimeBalance: 0,
      currency: "usd",
      autoTopUp: false,
      tier: null,
    });
  });

  it("returns empty wallet transactions when transaction storage is unavailable", async () => {
    vi.mocked(getDb).mockReturnValue(
      selectChain("offset", missingStorage("wallet_transactions")) as any
    );

    await expect(getWalletTransactions("user-1")).resolves.toEqual([]);
  });

  it("returns zero points when wallet storage is unavailable", async () => {
    vi.mocked(getDb).mockReturnValue(selectChain("limit", missingStorage("wallets")) as any);

    await expect(getPointsBalance("user-1")).resolves.toEqual({
      balance: 0,
      lifetimeBalance: 0,
    });
  });

  it("returns empty points history when the points ledger is unavailable", async () => {
    vi.mocked(getDb).mockReturnValue(selectChain("offset", missingStorage("points_ledger")) as any);

    await expect(getPointsHistory("user-1")).resolves.toEqual([]);
  });

  it("returns no tier when tier storage is unavailable", async () => {
    vi.mocked(getDb).mockReturnValue(selectChain("limit", missingStorage("user_tiers")) as any);

    await expect(getCurrentTier("user-1")).resolves.toBeNull();
  });
});
