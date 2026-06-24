import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));

import { getDb } from "../db";
import { spendFromWallet } from "../services/wallet.service";

const getDbMock = getDb as unknown as ReturnType<typeof vi.fn>;

/**
 * Chainable drizzle fake. Terminal calls (`.limit()` for selects,
 * `.returning()` for update/insert) resolve to the next queued result set.
 */
function fakeDb(queue: unknown[][]) {
  let i = 0;
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "set", "values", "update", "insert"]) {
    builder[m] = () => builder;
  }
  builder.limit = () => Promise.resolve(queue[i++] ?? []);
  builder.returning = () => Promise.resolve(queue[i++] ?? []);
  return builder;
}

beforeEach(() => getDbMock.mockReset());

describe("spendFromWallet — atomic double-spend protection", () => {
  it("rejects non-positive amounts", async () => {
    getDbMock.mockReturnValue(fakeDb([]));
    await expect(spendFromWallet("u1", 0)).rejects.toThrow(/positive/);
    await expect(spendFromWallet("u1", -5)).rejects.toThrow(/positive/);
  });

  it("throws when the wallet does not exist", async () => {
    getDbMock.mockReturnValue(fakeDb([[] /* select → no wallet */]));
    await expect(spendFromWallet("u1", 10)).rejects.toThrow(/Wallet not found/);
  });

  it("throws Insufficient balance when the conditional UPDATE matches no row, even if the prior read looked sufficient (the TOCTOU race)", async () => {
    // The initial SELECT reports balance 100 (looks like 80 is affordable), but
    // the atomic `balance >= amount` UPDATE matches zero rows because a
    // concurrent spend already drained the wallet. The new code must trust the
    // write, not the stale read.
    getDbMock.mockReturnValue(
      fakeDb([
        [{ userId: "u1", balance: 100 }], // select wallet
        [], // conditional update → no row matched
      ])
    );
    await expect(spendFromWallet("u1", 80)).rejects.toThrow(/Insufficient balance/);
  });

  it("debits the wallet and records a negative transaction when the UPDATE succeeds", async () => {
    getDbMock.mockReturnValue(
      fakeDb([
        [{ userId: "u1", balance: 100 }], // select wallet
        [{ balance: 20 }], // conditional update → row updated, new balance 20
        [{ id: "tx-1" }], // insert transaction
      ])
    );
    const result = await spendFromWallet("u1", 80, { description: "test" });
    expect(result.balance).toBe(20);
    expect(result.transactionId).toBe("tx-1");
  });
});
