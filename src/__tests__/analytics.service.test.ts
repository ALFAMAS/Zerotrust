import { describe, it, expect, vi, beforeEach } from "vitest";

// The analytics service talks to Postgres via getDb(). Mock the db module so we
// can exercise the aggregation/logging logic without a live database.
vi.mock("../db", () => ({ getDb: vi.fn() }));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { getDb } from "../db";
import {
  getFunnelCounts,
  getFeatureUsage,
  getZeroResultQueries,
  trackFeatureEvent,
  logSearchQuery,
} from "../services/analytics.service";

const getDbMock = getDb as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  getDbMock.mockReset();
});

// ── Funnel tracking ───────────────────────────────────────────────────────────

describe("getFunnelCounts", () => {
  it("counts how many users reached each funnel step from their metadata", async () => {
    const users = [
      { metadata: { funnelEvents: { signup: "t", email_verified: "t", first_login: "t" } } },
      { metadata: { funnelEvents: { signup: "t", email_verified: "t" } } },
      { metadata: { funnelEvents: { signup: "t" } } },
      { metadata: {} },
      { metadata: null },
    ];
    // Mirror the drizzle chain: db.select(...).from(...).where(...) → rows
    getDbMock.mockReturnValue({
      select: () => ({ from: () => ({ where: () => Promise.resolve(users) }) }),
    });

    const counts = await getFunnelCounts(new Date("2026-01-01"), new Date("2026-02-01"));

    expect(counts.signup).toBe(3);
    expect(counts.email_verified).toBe(2);
    expect(counts.first_login).toBe(1);
    expect(counts.mfa_enabled).toBe(0);
    // Every known step is present in the shape, even at zero.
    expect(Object.keys(counts).sort()).toEqual(
      [
        "activation",
        "email_verified",
        "first_login",
        "first_payment",
        "mfa_enabled",
        "profile_complete",
        "signup",
      ].sort()
    );
  });
});

// ── Per-feature analytics ─────────────────────────────────────────────────────

describe("trackFeatureEvent", () => {
  it("issues an insert and resolves", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    getDbMock.mockReturnValue({ execute });
    await expect(
      trackFeatureEvent("user-1", "billing", "upgrade", { plan: "pro" })
    ).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("swallows db errors (table may not exist yet)", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("relation does not exist"));
    getDbMock.mockReturnValue({ execute });
    await expect(trackFeatureEvent("user-1", "billing", "upgrade")).resolves.toBeUndefined();
  });
});

describe("getFeatureUsage", () => {
  it("returns the aggregated rows", async () => {
    const rows = [
      { action: "upgrade", count: 12 },
      { action: "view", count: 5 },
    ];
    getDbMock.mockReturnValue({ execute: vi.fn().mockResolvedValue(rows) });
    const usage = await getFeatureUsage("billing", new Date("2026-01-01"), new Date("2026-02-01"));
    expect(usage).toEqual(rows);
  });

  it("returns [] when the query throws", async () => {
    getDbMock.mockReturnValue({ execute: vi.fn().mockRejectedValue(new Error("boom")) });
    const usage = await getFeatureUsage("billing", new Date(), new Date());
    expect(usage).toEqual([]);
  });
});

// ── Search analytics ──────────────────────────────────────────────────────────

describe("logSearchQuery", () => {
  it("records the query (including zero-result) and resolves", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    getDbMock.mockReturnValue({ execute });
    await expect(logSearchQuery("user-1", "passkeys", 0, "global")).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("accepts a null userId for anonymous searches", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    getDbMock.mockReturnValue({ execute });
    await expect(logSearchQuery(null, "pricing", 3, "docs")).resolves.toBeUndefined();
  });
});

describe("getZeroResultQueries", () => {
  it("returns the zero-result queries with counts", async () => {
    const rows = [
      { query: "sso", count: 9 },
      { query: "scim", count: 4 },
    ];
    getDbMock.mockReturnValue({ execute: vi.fn().mockResolvedValue(rows) });
    const result = await getZeroResultQueries(new Date("2026-01-01"), new Date("2026-02-01"), 50);
    expect(result).toEqual(rows);
  });

  it("returns [] when the query throws", async () => {
    getDbMock.mockReturnValue({ execute: vi.fn().mockRejectedValue(new Error("boom")) });
    expect(await getZeroResultQueries(new Date(), new Date())).toEqual([]);
  });
});
