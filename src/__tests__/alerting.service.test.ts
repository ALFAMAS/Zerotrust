import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockDispatch = vi.fn().mockResolvedValue(undefined);
vi.mock("../notifications", () => ({
  notificationDispatcher: { dispatch: (...args: unknown[]) => mockDispatch(...args) },
}));

import {
  recordServerError,
  recordSlowRequest,
  resetAlertingState,
} from "../services/ops/alerting.service";

describe("alerting.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAlertingState();
    process.env.ALERT_ERROR_THRESHOLD = "5";
    process.env.ALERT_WINDOW_SECS = "60";
    process.env.ALERT_LATENCY_COUNT = "3";
    process.env.ALERT_COOLDOWN_SECS = "300";
  });

  it("stays quiet below the error threshold", () => {
    for (let i = 0; i < 4; i++) recordServerError({ path: "/x", status: 500 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("dispatches error.spike when the threshold is crossed", () => {
    for (let i = 0; i < 5; i++) recordServerError({ path: "/auth/login", status: 500 });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const [event, data] = mockDispatch.mock.calls[0];
    expect(event).toBe("error.spike");
    expect(data.count).toBe(5);
    expect(data.lastPath).toBe("/auth/login");
  });

  it("respects the cooldown — only one alert per window", () => {
    for (let i = 0; i < 20; i++) recordServerError({ path: "/x", status: 500 });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it("dispatches latency.breach after enough slow requests", () => {
    for (let i = 0; i < 3; i++) recordSlowRequest(8000, "/billing/checkout");
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const [event, data] = mockDispatch.mock.calls[0];
    expect(event).toBe("latency.breach");
    expect(data.lastPath).toBe("/billing/checkout");
  });
});
