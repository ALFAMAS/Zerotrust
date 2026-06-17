import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUsageSummaryMock, broadcastMock, sendEmailMock } = vi.hoisted(() => ({
  getUsageSummaryMock: vi.fn(),
  broadcastMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("../services/usage.service", () => ({ getUsageSummary: getUsageSummaryMock }));
vi.mock("../api/routes/notification.routes", () => ({ broadcastNotification: broadcastMock }));
vi.mock("../services/email.service", () => ({ sendNotificationEmail: sendEmailMock }));
vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  evaluateUsageNudges,
  runUsageNudges,
  _resetUsageNudgeDedup,
} from "../services/usageNudge.service";

describe("evaluateUsageNudges (pure)", () => {
  it("warns at >= 80% and below 100%", () => {
    const out = evaluateUsageNudges({
      period: "2026-06",
      metrics: { api_calls: { used: 8500, limit: 10000 } },
    });
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe("warning");
  });

  it("marks exceeded at >= 100%", () => {
    const out = evaluateUsageNudges({
      period: "2026-06",
      metrics: { api_calls: { used: 10000, limit: 10000 } },
    });
    expect(out[0].level).toBe("exceeded");
  });

  it("ignores unlimited (limit <= 0) and unused metrics", () => {
    const out = evaluateUsageNudges({
      period: "2026-06",
      metrics: {
        api_calls: { used: 999999, limit: -1 }, // unlimited
        seats: { used: 0, limit: 5 }, // unused
        storage_bytes: { used: 10, limit: 100 }, // 10% — below threshold
      },
    });
    expect(out).toHaveLength(0);
  });
});

describe("runUsageNudges (dispatch + dedup)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetUsageNudgeDedup();
  });

  it("dispatches in-app + email once, then dedupes within the period", async () => {
    getUsageSummaryMock.mockResolvedValue({
      period: "2026-06",
      metrics: { api_calls: { used: 9000, limit: 10000 } },
    });

    const first = await runUsageNudges({ userId: "u1" }, "u1", { email: "u1@test.com" });
    expect(first).toHaveLength(1);
    expect(broadcastMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(broadcastMock.mock.calls[0][1].type).toBe("usage_nudge");

    // Throttle clears so the second call recomputes, but dedup suppresses re-notify.
    _resetThrottleOnly();
    const second = await runUsageNudges({ userId: "u1" }, "u1", { email: "u1@test.com" });
    expect(second).toHaveLength(0);
    expect(broadcastMock).toHaveBeenCalledTimes(1);
  });

  it("throttles repeated checks (no summary recompute within the interval)", async () => {
    getUsageSummaryMock.mockResolvedValue({
      period: "2026-06",
      metrics: { api_calls: { used: 9000, limit: 10000 } },
    });
    await runUsageNudges({ userId: "u2" }, "u2");
    await runUsageNudges({ userId: "u2" }, "u2"); // within interval → short-circuits
    expect(getUsageSummaryMock).toHaveBeenCalledTimes(1);
  });
});

// Helper: clear only the throttle (not the dedup) to exercise dedup in isolation.
function _resetThrottleOnly() {
  // The service exposes a combined reset; emulate a throttle-only reset by
  // advancing time instead.
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10 * 60 * 1000);
}
