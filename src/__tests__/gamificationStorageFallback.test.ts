import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../db/schema", () => ({
  streaksTable: {
    userId: "user_id",
    currentStreak: "current_streak",
    longestStreak: "longest_streak",
    lastLoginDate: "last_login_date",
    lastLoginAt: "last_login_at",
  },
  achievementsTable: {
    userId: "user_id",
    key: "key",
    unlockedAt: "unlocked_at",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { getDb } from "../db";
import { getUserAchievements } from "../services/achievement.service";
import { getStreak } from "../services/streak.service";

function makeSelectChain(finalMethod: "limit" | "orderBy", result: unknown) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(),
    orderBy: vi.fn(),
  };
  chain[finalMethod].mockImplementation(() => {
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  });

  return {
    select: vi.fn(() => chain),
  };
}

describe("gamification storage fallbacks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty streak when the streaks table is missing", async () => {
    const err = Object.assign(new Error('relation "streaks" does not exist'), { code: "42P01" });
    vi.mocked(getDb).mockReturnValue(makeSelectChain("limit", err) as any);

    await expect(getStreak("user-1")).resolves.toEqual({
      currentStreak: 0,
      longestStreak: 0,
      lastLoginDate: null,
    });
  });

  it("returns no unlocked achievements when the achievements table is missing", async () => {
    const err = Object.assign(new Error('relation "achievements" does not exist'), {
      code: "42P01",
    });
    vi.mocked(getDb).mockReturnValue(makeSelectChain("orderBy", err) as any);

    await expect(getUserAchievements("user-1")).resolves.toEqual([]);
  });

  it("still throws unexpected streak query failures", async () => {
    vi.mocked(getDb).mockReturnValue(makeSelectChain("limit", new Error("db down")) as any);

    await expect(getStreak("user-1")).rejects.toThrow("db down");
  });
});
