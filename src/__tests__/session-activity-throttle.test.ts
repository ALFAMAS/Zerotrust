import { afterEach, describe, expect, it, vi } from "vitest";

// auth.ts pulls config/db/logger transitively at import time; stub the heavy
// bits so the module loads without a real database/config. The functions under
// test are pure.
vi.mock("../config", () => ({
  getConfig: () => ({
    security: { tokenSecretHex: "a".repeat(64) },
    session: { defaultTTL: 3600, refreshTokenTTL: 604800, maxConcurrentDevices: 5 },
  }),
}));
vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { activityRefreshSeconds, shouldRefreshActivity } from "../middleware/auth";

describe("shouldRefreshActivity", () => {
  const now = new Date("2026-06-25T12:00:00.000Z");

  it("writes when there is no prior activity timestamp", () => {
    expect(shouldRefreshActivity(null, now, 60)).toBe(true);
    expect(shouldRefreshActivity(undefined, now, 60)).toBe(true);
  });

  it("writes when an invalid timestamp is stored (fails open)", () => {
    expect(shouldRefreshActivity("not-a-date", now, 60)).toBe(true);
  });

  it("skips the write inside the throttle window", () => {
    const recent = new Date(now.getTime() - 30_000); // 30s ago, window 60s
    expect(shouldRefreshActivity(recent, now, 60)).toBe(false);
  });

  it("writes once the window has fully elapsed", () => {
    const stale = new Date(now.getTime() - 61_000); // 61s ago, window 60s
    expect(shouldRefreshActivity(stale, now, 60)).toBe(true);
  });

  it("treats exactly the window boundary as due", () => {
    const boundary = new Date(now.getTime() - 60_000);
    expect(shouldRefreshActivity(boundary, now, 60)).toBe(true);
  });

  it("always writes when the interval is non-positive (throttle disabled)", () => {
    const recent = new Date(now.getTime() - 1_000);
    expect(shouldRefreshActivity(recent, now, 0)).toBe(true);
    expect(shouldRefreshActivity(recent, now, -5)).toBe(true);
  });

  it("accepts ISO-string timestamps", () => {
    const recent = new Date(now.getTime() - 10_000).toISOString();
    expect(shouldRefreshActivity(recent, now, 60)).toBe(false);
  });
});

describe("activityRefreshSeconds", () => {
  const original = process.env.SESSION_ACTIVITY_REFRESH_SECONDS;
  afterEach(() => {
    if (original === undefined) delete process.env.SESSION_ACTIVITY_REFRESH_SECONDS;
    else process.env.SESSION_ACTIVITY_REFRESH_SECONDS = original;
  });

  it("defaults to 60s with no idle timeout and no override", () => {
    delete process.env.SESSION_ACTIVITY_REFRESH_SECONDS;
    expect(activityRefreshSeconds(0)).toBe(60);
  });

  it("honors the env override", () => {
    process.env.SESSION_ACTIVITY_REFRESH_SECONDS = "120";
    expect(activityRefreshSeconds(0)).toBe(120);
  });

  it("clamps to half the idle timeout so enforcement stays accurate", () => {
    delete process.env.SESSION_ACTIVITY_REFRESH_SECONDS;
    expect(activityRefreshSeconds(90)).toBe(45); // half of 90 < 60 default
  });

  it("keeps the base when half the idle timeout exceeds it", () => {
    delete process.env.SESSION_ACTIVITY_REFRESH_SECONDS;
    expect(activityRefreshSeconds(600)).toBe(60); // half of 600 = 300 > 60
  });

  it("never returns below 1 even for a tiny idle timeout", () => {
    delete process.env.SESSION_ACTIVITY_REFRESH_SECONDS;
    expect(activityRefreshSeconds(1)).toBe(1);
  });

  it("falls back to the default for an invalid override", () => {
    process.env.SESSION_ACTIVITY_REFRESH_SECONDS = "abc";
    expect(activityRefreshSeconds(0)).toBe(60);
  });
});
