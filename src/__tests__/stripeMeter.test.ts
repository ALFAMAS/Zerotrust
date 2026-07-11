import { beforeEach, describe, expect, it, vi } from "vitest";

const meterCreate = vi.fn().mockResolvedValue({ identifier: "mevt_1" });

vi.mock("../services/billing/stripeWebhookProcessor", () => ({
  getStripe: vi.fn(() => ({
    billing: {
      meterEvents: { create: meterCreate },
    },
  })),
}));

vi.mock("../db", () => ({
  getReadDb: vi.fn(() => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ stripeCustomerId: "cus_test" }]),
        }),
      }),
    }),
  })),
}));

describe("stripeMeter.service", () => {
  beforeEach(async () => {
    vi.resetModules();
    meterCreate.mockClear();
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_METER_ENABLED = "true";
  });

  it("isStripeMeterEnabled requires env flags", async () => {
    const { isStripeMeterEnabled } = await import("../services/billing/stripeMeter.service");
    expect(isStripeMeterEnabled()).toBe(true);
    delete process.env.STRIPE_METER_ENABLED;
    vi.resetModules();
    const mod = await import("../services/billing/stripeMeter.service");
    expect(mod.isStripeMeterEnabled()).toBe(false);
  });

  it("recordStripeMeterEvent calls Stripe billing meterEvents", async () => {
    const { recordStripeMeterEvent } = await import("../services/billing/stripeMeter.service");
    const ok = await recordStripeMeterEvent({
      orgId: "org-1",
      metric: "api_calls",
      quantity: 3,
    });
    expect(ok).toBe(true);
    expect(meterCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          stripe_customer_id: "cus_test",
          value: "3",
        }),
      })
    );
  });
});
