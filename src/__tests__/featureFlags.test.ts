import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const flags = new Map<string, { enabled: boolean; rolloutPercent: number }>();

vi.mock("../db", () => ({
  getReadDb: vi.fn(() => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(async () => {
            const row = flags.get("org1:beta_ui");
            if (!row) return [];
            return [
              {
                key: "beta_ui",
                enabled: row.enabled,
                rolloutPercent: row.rolloutPercent,
                metadata: {},
              },
            ];
          }),
        }),
      }),
    }),
  })),
}));

import { isFeatureEnabled } from "../shared/featureFlags";

describe("featureFlags", () => {
  beforeEach(() => {
    flags.clear();
  });

  it("returns false for missing flags", async () => {
    expect(await isFeatureEnabled("org1", "missing")).toBe(false);
  });

  it("returns false when disabled", async () => {
    flags.set("org1:beta_ui", { enabled: false, rolloutPercent: 100 });
    expect(await isFeatureEnabled("org1", "beta_ui", "user-1")).toBe(false);
  });

  it("respects rollout percent buckets", async () => {
    flags.set("org1:beta_ui", { enabled: true, rolloutPercent: 0 });
    expect(await isFeatureEnabled("org1", "beta_ui", "user-1")).toBe(false);

    flags.set("org1:beta_ui", { enabled: true, rolloutPercent: 100 });
    expect(await isFeatureEnabled("org1", "beta_ui", "user-1")).toBe(true);
  });
});
