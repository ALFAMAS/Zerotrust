import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, setUpdateResult, resetDb } = vi.hoisted(() => {
  let updateResult: any = { count: 0 };
  const chain: any = {
    update: () => chain,
    set: () => chain,
    where: () => Promise.resolve(updateResult),
  };
  return {
    mockDb: chain,
    setUpdateResult: (result: any) => {
      updateResult = result;
    },
    resetDb: () => {
      updateResult = { count: 0 };
    },
  };
});

vi.mock("../db", () => ({ getDb: () => mockDb }));
vi.mock("../db/schema", () => ({ sessionsTable: { id: "id", userId: "user_id", isActive: "is_active" } }));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ and: args })),
  eq: vi.fn(),
  ne: vi.fn(),
}));
vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { revokeAllSessionsForUser } from "../middleware/sessionControl";

describe("revokeAllSessionsForUser", () => {
  beforeEach(() => resetDb());
  afterEach(() => vi.clearAllMocks());

  it("reports the real affected-row count from the postgres driver's `.count` field", async () => {
    // The `postgres` driver's update-without-.returning() result exposes the
    // affected row count as `.count`, not `.rowCount` — this regression test
    // guards against reintroducing that mismatch (see dataRetention.ts).
    setUpdateResult({ count: 3 });
    const count = await revokeAllSessionsForUser("user-1");
    expect(count).toBe(3);
  });

  it("returns 0 when no sessions were revoked", async () => {
    setUpdateResult({ count: 0 });
    const count = await revokeAllSessionsForUser("user-1");
    expect(count).toBe(0);
  });
});
