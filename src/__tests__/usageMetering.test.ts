import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsert = vi.fn();
const mockSelect = vi.fn();

vi.mock("../db/index", () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: mockInsert,
      }),
    }),
  }),
  getReadDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockSelect,
        }),
      }),
    }),
  }),
}));

vi.mock("../logger/index", () => ({
  getLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import {
  apiKeyUsageMetric,
  currentPeriod,
  getUsage,
  incrementUsage,
} from "../shared/usageMetering";

describe("shared/usageMetering", () => {
  beforeEach(() => {
    mockInsert.mockReset().mockResolvedValue(undefined);
    mockSelect.mockReset().mockResolvedValue([{ value: 42 }]);
  });

  it("formats the current UTC billing period", () => {
    expect(currentPeriod(new Date("2026-07-03T12:00:00Z"))).toBe("2026-07");
    expect(currentPeriod(new Date("2026-01-15T00:00:00Z"))).toBe("2026-01");
  });

  it("builds per-api-key metric names", () => {
    expect(apiKeyUsageMetric("key-123")).toBe("api_key:key-123:api_calls");
  });

  it("no-ops incrementUsage when scope has neither userId nor orgId", async () => {
    await incrementUsage("api_calls", {});
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("upserts usage for a scoped user", async () => {
    await incrementUsage("api_calls", { userId: "u1" }, 3);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("reads the current-period counter value", async () => {
    const value = await getUsage("api_calls", { orgId: "org-1" });
    expect(value).toBe(42);
    expect(mockSelect).toHaveBeenCalledWith(1);
  });

  it("returns 0 when no usage row exists", async () => {
    mockSelect.mockResolvedValueOnce([]);
    expect(await getUsage("api_calls", { userId: "u1" })).toBe(0);
  });
});
