import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  customersCreate: vi.fn().mockResolvedValue({ id: "cus_new" }),
  checkoutCreate: vi.fn().mockResolvedValue({
    id: "cs_test",
    url: "https://checkout.stripe.com/c/pay/cs_test",
  }),
  selectQueue: [] as unknown[][],
  walletInsert: vi.fn().mockResolvedValue(undefined),
  walletUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("stripe", () => ({
  default: vi.fn(function StripeMock() {
    return {
      customers: { create: h.customersCreate },
      checkout: { sessions: { create: h.checkoutCreate } },
    };
  }),
}));

vi.mock("../db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(h.selectQueue.shift() ?? []),
        }),
      }),
    }),
    insert: () => ({
      values: () => {
        h.walletInsert();
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: () => ({
        where: () => {
          h.walletUpdate();
          return Promise.resolve();
        },
      }),
    }),
  }),
}));

vi.mock("../services/billing/wallet.service", () => ({
  getWallet: vi.fn().mockResolvedValue({ balance: 0, lifetimeBalance: 0, currency: "usd", autoTopUp: false }),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { createWalletTopUpCheckout } from "../services/billing/walletTopUp.service";

describe("createWalletTopUpCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.selectQueue = [[], []];
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.APP_URL = "http://localhost:3000";
  });

  it("creates a Stripe Checkout session in payment mode", async () => {
    const result = await createWalletTopUpCheckout({
      userId: "user-1",
      email: "u@example.com",
      displayName: "Test User",
      amountCents: 1500,
    });

    expect(result).toEqual({
      url: "https://checkout.stripe.com/c/pay/cs_test",
      sessionId: "cs_test",
    });
    expect(h.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 1500, currency: "usd" }),
          }),
        ],
        payment_intent_data: {
          metadata: { userId: "user-1", purpose: "wallet_top_up" },
        },
      })
    );
    expect(h.customersCreate).toHaveBeenCalled();
  });

  it("reuses an existing wallet Stripe customer id", async () => {
    h.selectQueue = [[{ stripeCustomerId: "cus_existing" }]];

    await createWalletTopUpCheckout({
      userId: "user-1",
      email: "u@example.com",
      displayName: "Test User",
      amountCents: 500,
    });

    expect(h.customersCreate).not.toHaveBeenCalled();
    expect(h.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" })
    );
  });

  it("rejects non-positive amounts", async () => {
    await expect(
      createWalletTopUpCheckout({
        userId: "user-1",
        email: "u@example.com",
        displayName: "Test User",
        amountCents: 0,
      })
    ).rejects.toThrow(/positive/);
  });
});
