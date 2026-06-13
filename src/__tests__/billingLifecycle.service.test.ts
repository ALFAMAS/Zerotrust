import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

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

const mockSendBillingEventEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/email.service", () => ({
  sendBillingEventEmail: (...args: unknown[]) => mockSendBillingEventEmail(...args),
}));

import { getDb } from "../db";
import {
  processTrialExpiry,
  processDunning,
  processWinback,
  DUNNING_DAYS,
  WINBACK_DAYS,
} from "../services/billingLifecycle.service";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const DAY_MS = 86400_000;

const baseUser = { email: "owner@example.com", displayName: "Owner" };

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    userId: USER_ID,
    orgId: null,
    plan: "pro",
    status: "active",
    trialEnd: null,
    canceledAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * The lifecycle functions issue, in order:
 *   1. select subscriptions (where → Promise<sub[]>)
 *   2. per email: select user (limit → Promise<user[]>)
 *   3. metadata save: update/set/where → resolves
 */
function makeDb(subs: any[]) {
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([baseUser]),
  };
  let firstWhere = true;
  db.where = vi.fn().mockImplementation(() => {
    if (firstWhere) {
      firstWhere = false;
      return Promise.resolve(subs);
    }
    // subsequent .where on select-user chains returns the chain (limit ends it);
    // on update chains it terminates → resolve undefined
    return Object.assign(Promise.resolve(undefined), db);
  });
  return db;
}

describe("billingLifecycle.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processTrialExpiry", () => {
    it("sends a warning when the trial ends within 3 days", async () => {
      const sub = makeSub({
        status: "trialing",
        trialEnd: new Date(Date.now() + 2 * DAY_MS),
      });
      (getDb as any).mockReturnValue(makeDb([sub]));

      const sent = await processTrialExpiry();
      expect(sent).toBe(1);
      const payload = mockSendBillingEventEmail.mock.calls[0][1];
      expect(payload.title).toContain("trial ends in");
    });

    it("sends the upgrade prompt when the trial has lapsed", async () => {
      const sub = makeSub({
        status: "trialing",
        trialEnd: new Date(Date.now() - 1 * DAY_MS),
      });
      (getDb as any).mockReturnValue(makeDb([sub]));

      const sent = await processTrialExpiry();
      expect(sent).toBe(1);
      const payload = mockSendBillingEventEmail.mock.calls[0][1];
      expect(payload.title).toContain("trial has ended");
    });

    it("does not re-send a warning already recorded in metadata", async () => {
      const sub = makeSub({
        status: "trialing",
        trialEnd: new Date(Date.now() + 2 * DAY_MS),
        metadata: { trialWarningSentAt: new Date().toISOString() },
      });
      (getDb as any).mockReturnValue(makeDb([sub]));

      const sent = await processTrialExpiry();
      expect(sent).toBe(0);
      expect(mockSendBillingEventEmail).not.toHaveBeenCalled();
    });

    it("ignores trials not ending soon", async () => {
      const sub = makeSub({
        status: "trialing",
        trialEnd: new Date(Date.now() + 10 * DAY_MS),
      });
      (getDb as any).mockReturnValue(makeDb([sub]));

      expect(await processTrialExpiry()).toBe(0);
    });
  });

  describe("processDunning", () => {
    it("sends the day-3 reminder once past_due for 3+ days", async () => {
      const sub = makeSub({
        status: "past_due",
        metadata: {
          dunningStartedAt: new Date(Date.now() - 4 * DAY_MS).toISOString(),
          dunningStagesSent: [],
        },
      });
      (getDb as any).mockReturnValue(makeDb([sub]));

      const sent = await processDunning();
      expect(sent).toBe(1);
      const payload = mockSendBillingEventEmail.mock.calls[0][1];
      expect(payload.title).toContain("Payment failed");
    });

    it("sends the final notice at day 14", async () => {
      const lastStage = DUNNING_DAYS[DUNNING_DAYS.length - 1];
      const sub = makeSub({
        status: "past_due",
        metadata: {
          dunningStartedAt: new Date(Date.now() - (lastStage + 1) * DAY_MS).toISOString(),
          dunningStagesSent: [3, 7],
        },
      });
      (getDb as any).mockReturnValue(makeDb([sub]));

      const sent = await processDunning();
      expect(sent).toBe(1);
      const payload = mockSendBillingEventEmail.mock.calls[0][1];
      expect(payload.title).toContain("Final notice");
    });

    it("never repeats an already-sent stage", async () => {
      const sub = makeSub({
        status: "past_due",
        metadata: {
          dunningStartedAt: new Date(Date.now() - 5 * DAY_MS).toISOString(),
          dunningStagesSent: [3],
        },
      });
      (getDb as any).mockReturnValue(makeDb([sub]));

      expect(await processDunning()).toBe(0);
    });
  });

  describe("processWinback", () => {
    it("sends the day-7 win-back email", async () => {
      const sub = makeSub({
        status: "canceled",
        canceledAt: new Date(Date.now() - 8 * DAY_MS),
      });
      (getDb as any).mockReturnValue(makeDb([sub]));

      const sent = await processWinback();
      expect(sent).toBe(1);
      const payload = mockSendBillingEventEmail.mock.calls[0][1];
      expect(payload.title).toContain("back");
    });

    it("respects already-sent win-back stages", async () => {
      const sub = makeSub({
        status: "canceled",
        canceledAt: new Date(Date.now() - 10 * DAY_MS),
        metadata: { winbackStagesSent: [7] },
      });
      (getDb as any).mockReturnValue(makeDb([sub]));

      expect(await processWinback()).toBe(0);
    });

    it("sends later stages as time passes", async () => {
      const sub = makeSub({
        status: "canceled",
        canceledAt: new Date(Date.now() - (WINBACK_DAYS[1] + 1) * DAY_MS),
        metadata: { winbackStagesSent: [7] },
      });
      (getDb as any).mockReturnValue(makeDb([sub]));

      expect(await processWinback()).toBe(1);
    });
  });
});
