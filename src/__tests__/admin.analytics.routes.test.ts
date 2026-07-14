/**
 * Admin analytics router tests (DQ-3 coverage for admin/analytics.routes.ts).
 *
 * GET /analytics awaits three selects in a fixed order (cohort users,
 * auth-method users, recent sessions); the db mock is a FIFO consumed in
 * that order.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const queue: unknown[] = [];

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ["select", "from", "where", "limit", "orderBy"]) {
    builder[m] = vi.fn(chain);
  }
  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    if (queue.length === 0) return reject(new Error("analytics test: query queue exhausted"));
    return resolve(queue.shift());
  };
  return builder;
}

const db = makeBuilder();

vi.mock("../db", () => ({
  getDb: vi.fn(() => db),
  getReadDb: vi.fn(() => db),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import analyticsRouter from "../api/routes/admin/analytics.routes";

const NOW = Date.now();
const days = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000);

describe("GET /analytics (admin)", () => {
  beforeEach(() => {
    queue.length = 0;
  });

  it("aggregates cohorts, auth-method mix, and anomaly trends", async () => {
    const signup = days(21);
    queue.push([{ id: "u1", createdAt: signup }]); // cohort users (12w)
    queue.push([
      { passwordHash: "hash", oauthProviders: [], passkeys: [] },
      { passwordHash: null, oauthProviders: [{ provider: "google" }], passkeys: [] },
      { passwordHash: "hash", oauthProviders: [], passkeys: [{ id: "pk" }] },
      { passwordHash: null, oauthProviders: "not-an-array", passkeys: null },
    ]); // auth mix users
    queue.push([
      // week-0 activity for u1's cohort + anomaly-flagged session in the last 30d
      { userId: "u1", lastActivityAt: signup, anomalyFlags: { impossibleTravel: true }, createdAt: days(3) },
      // unflagged session — excluded from trends
      { userId: "u1", lastActivityAt: days(14), anomalyFlags: null, createdAt: days(2) },
      // flagged but empty flags object — excluded
      { userId: "u1", lastActivityAt: days(14), anomalyFlags: {}, createdAt: days(2) },
      // session for an unknown user — ignored by cohorts
      { userId: "ghost", lastActivityAt: days(1), anomalyFlags: { velocity: 1 }, createdAt: days(1) },
    ]); // recent sessions

    const res = await analyticsRouter.request("http://admin.test/analytics");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.cohorts).toHaveLength(1);
    expect(body.cohorts[0].cohortSize).toBe(1);
    expect(body.cohorts[0].retention).toHaveLength(9);
    expect(body.cohorts[0].retention[0]).toBe(100); // active in cohort week 0

    expect(body.authMethodMix).toEqual({ password: 2, oauth: 1, passkey: 1, total: 4 });

    // two flagged sessions inside the window (u1 day-3 + ghost day-1)
    const flagged = body.anomalyTrends.reduce(
      (n: number, p: { flaggedSessions: number }) => n + p.flaggedSessions,
      0
    );
    expect(flagged).toBe(2);
    // sorted ascending by date
    const dates = body.anomalyTrends.map((p: { date: string }) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("returns empty aggregates with no data", async () => {
    queue.push([]);
    queue.push([]);
    queue.push([]);
    const res = await analyticsRouter.request("http://admin.test/analytics");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cohorts).toEqual([]);
    expect(body.authMethodMix).toEqual({ password: 0, oauth: 0, passkey: 0, total: 0 });
    expect(body.anomalyTrends).toEqual([]);
  });

  it("returns the canonical 500 envelope when the db fails", async () => {
    // empty queue -> builder rejects
    const res = await analyticsRouter.request("http://admin.test/analytics");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
