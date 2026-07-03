import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));

function makeDb(returningRows: unknown[] = []) {
  const chain: any = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returningRows),
    transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(chain)),
  };
  return chain;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("subscription repository optimistic locking", () => {
  it("setSubscriptionPaused returns false when expected version does not match", async () => {
    const db = makeDb([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { setSubscriptionPaused } = await import(
      "../db/repositories/billingSubscriptions.repository"
    );

    const ok = await setSubscriptionPaused({
      subscriptionId: "sub-1",
      userId: "user-1",
      expectedVersion: 1,
    });

    expect(ok).toBe(false);
  });

  it("reactivateSubscription returns true when the version matches", async () => {
    const db = makeDb([{ id: "sub-1" }]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { reactivateSubscription } = await import(
      "../db/repositories/billingSubscriptions.repository"
    );

    const ok = await reactivateSubscription({
      subscriptionId: "sub-1",
      expectedVersion: 2,
    });

    expect(ok).toBe(true);
  });
});
