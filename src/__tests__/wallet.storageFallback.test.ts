import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(), getReadDb: vi.fn() }));
vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { getDb, getReadDb } from "../db";
import {
  getWallet,
  getWalletTransactions,
} from "../services/billing/wallet.service";

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
    });
  });

  it("returns empty wallet transactions when transaction storage is unavailable", async () => {
    vi.mocked(getReadDb).mockReturnValue(
      selectChain("offset", missingStorage("wallet_transactions")) as any
    );

    await expect(getWalletTransactions("user-1")).resolves.toEqual([]);
  });
});
