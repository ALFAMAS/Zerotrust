import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  getDb: vi.fn(),
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
import { isFeatureEnabled, clearFlagCache } from "../services/featureFlags.service";

function makeDbReturning(flag: any) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(flag ? [flag] : []),
  };
}

function flagRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "flag-1",
    key: "new-dashboard",
    description: null,
    enabled: false,
    enabledForUsers: [],
    rolloutPercent: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("featureFlags.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearFlagCache();
  });

  it("returns false for unknown flags", async () => {
    (getDb as any).mockReturnValue(makeDbReturning(null));
    expect(await isFeatureEnabled("does-not-exist")).toBe(false);
  });

  it("returns true for globally enabled flags", async () => {
    (getDb as any).mockReturnValue(makeDbReturning(flagRow({ enabled: true })));
    expect(await isFeatureEnabled("new-dashboard")).toBe(true);
  });

  it("force-enables for listed users", async () => {
    (getDb as any).mockReturnValue(makeDbReturning(flagRow({ enabledForUsers: ["user-vip"] })));
    expect(await isFeatureEnabled("new-dashboard", "user-vip")).toBe(true);
    clearFlagCache();
    expect(await isFeatureEnabled("new-dashboard", "user-other")).toBe(false);
  });

  it("percentage rollout is stable for the same user", async () => {
    (getDb as any).mockReturnValue(makeDbReturning(flagRow({ rolloutPercent: 50 })));
    const first = await isFeatureEnabled("new-dashboard", "stable-user");
    clearFlagCache();
    (getDb as any).mockReturnValue(makeDbReturning(flagRow({ rolloutPercent: 50 })));
    const second = await isFeatureEnabled("new-dashboard", "stable-user");
    expect(first).toBe(second);
  });

  it("100% rollout enables everyone", async () => {
    (getDb as any).mockReturnValue(makeDbReturning(flagRow({ rolloutPercent: 100 })));
    expect(await isFeatureEnabled("new-dashboard", "anyone")).toBe(true);
  });

  it("0% rollout (and not enabled) disables everyone", async () => {
    (getDb as any).mockReturnValue(makeDbReturning(flagRow({ rolloutPercent: 0 })));
    expect(await isFeatureEnabled("new-dashboard", "anyone")).toBe(false);
  });
});
