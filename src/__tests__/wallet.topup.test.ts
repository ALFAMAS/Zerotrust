import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));

import { getDb } from "../db";
import { topUpWallet } from "../db/repositories/wallet.repository";

const getDbMock = getDb as unknown as ReturnType<typeof vi.fn>;

function fakeDb(queue: unknown[][]) {
  let i = 0;
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "set", "values", "update", "insert"]) {
    builder[m] = () => builder;
  }
  builder.limit = () => Promise.resolve(queue[i++] ?? []);
  builder.returning = () => Promise.resolve(queue[i++] ?? []);
  builder.transaction = async (fn: (tx: unknown) => unknown) => fn(builder);
  return builder;
}

beforeEach(() => getDbMock.mockReset());

describe("topUpWallet — atomic increment & idempotency (M6)", () => {
  it("rejects non-positive amounts", async () => {
    getDbMock.mockReturnValue(fakeDb([]));
    await expect(topUpWallet("u1", 0)).rejects.toThrow(/positive/);
    await expect(topUpWallet("u1", -10)).rejects.toThrow(/positive/);
  });

  it("returns the existing transaction when stripePaymentIntentId was already credited", async () => {
    getDbMock.mockReturnValue(
      fakeDb([[{ id: "tx-existing", balanceAfter: 500, stripePaymentIntentId: "pi_123" }]])
    );
    const result = await topUpWallet("u1", 100, { stripePaymentIntentId: "pi_123" });
    expect(result).toEqual({ balance: 500, transactionId: "tx-existing" });
  });

  it("uses an atomic SQL increment and records the transaction", async () => {
    getDbMock.mockReturnValue(
      fakeDb([
        [{ userId: "u1", balance: 100 }], // wallet exists
        [{ balance: 150 }], // atomic update returning new balance
        [{ id: "tx-new" }], // insert transaction
      ])
    );
    const result = await topUpWallet("u1", 50, { description: "test top-up" });
    expect(result).toEqual({ balance: 150, transactionId: "tx-new" });
  });

  it("creates the wallet row when missing, then increments atomically", async () => {
    getDbMock.mockReturnValue(
      fakeDb([
        [], // no wallet yet
        [{ balance: 25 }], // atomic update after insert
        [{ id: "tx-1" }],
      ])
    );
    const result = await topUpWallet("u1", 25);
    expect(result.balance).toBe(25);
    expect(result.transactionId).toBe("tx-1");
  });
});
