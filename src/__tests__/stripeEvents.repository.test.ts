import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db";
import { claimStripeEvent, releaseStripeEvent } from "../db/repositories/stripeEvents.repository";

const mockGetDb = vi.mocked(getDb);

describe("stripeEvents repository — webhook idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("claimStripeEvent", () => {
    it("returns true when the event id is new (insert won the claim)", async () => {
      const returning = vi.fn().mockResolvedValue([{ eventId: "evt_1" }]);
      const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
      const values = vi.fn().mockReturnValue({ onConflictDoNothing });
      const insert = vi.fn().mockReturnValue({ values });
      mockGetDb.mockReturnValue({ insert } as never);

      const claimed = await claimStripeEvent("evt_1", "customer.subscription.updated");

      expect(claimed).toBe(true);
      expect(values).toHaveBeenCalledWith({
        eventId: "evt_1",
        type: "customer.subscription.updated",
      });
      expect(onConflictDoNothing).toHaveBeenCalled();
    });

    it("returns false when the event was already recorded (conflict, no rows)", async () => {
      const returning = vi.fn().mockResolvedValue([]);
      const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
      const values = vi.fn().mockReturnValue({ onConflictDoNothing });
      const insert = vi.fn().mockReturnValue({ values });
      mockGetDb.mockReturnValue({ insert } as never);

      const claimed = await claimStripeEvent("evt_dupe", "invoice.payment_failed");

      expect(claimed).toBe(false);
    });
  });

  describe("releaseStripeEvent", () => {
    it("deletes the claimed event row so a retry can reprocess it", async () => {
      const where = vi.fn().mockResolvedValue(undefined);
      const del = vi.fn().mockReturnValue({ where });
      mockGetDb.mockReturnValue({ delete: del } as never);

      await releaseStripeEvent("evt_failed");

      expect(del).toHaveBeenCalledTimes(1);
      expect(where).toHaveBeenCalledTimes(1);
    });
  });
});
