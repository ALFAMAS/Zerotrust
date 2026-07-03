import { beforeEach, describe, expect, it, vi } from "vitest";

// Billing-webhook hot path (B4): stripeWebhookProcessor.ts is shared by both
// the synchronous request-path fallback and the BullMQ queue worker
// (stripeWebhookQueue.ts). billing.webhooks.test.ts only exercises the
// "customer.subscription.updated" branch end-to-end through the route; this
// file drives every event-type branch directly against `processStripeEvent`.

const h = vi.hoisted(() => ({
  subscriptionsRetrieve: vi.fn(),
  upsertCheckoutSubscription: vi.fn().mockResolvedValue(undefined),
  applySubscriptionLifecycleUpdate: vi.fn().mockResolvedValue(undefined),
  recordInvoicePaymentFailure: vi.fn().mockResolvedValue(undefined),
  clearSubscriptionDunning: vi.fn().mockResolvedValue(undefined),
  topUpWallet: vi.fn().mockResolvedValue({ balance: 500, transactionId: "tx-wallet" }),
}));

vi.mock("stripe", () => ({
  default: vi.fn(function StripeMock() {
    return { subscriptions: { retrieve: h.subscriptionsRetrieve } };
  }),
}));

vi.mock("../db/repositories/billingSubscriptions.repository", () => ({
  upsertCheckoutSubscription: h.upsertCheckoutSubscription,
  applySubscriptionLifecycleUpdate: h.applySubscriptionLifecycleUpdate,
  recordInvoicePaymentFailure: h.recordInvoicePaymentFailure,
  clearSubscriptionDunning: h.clearSubscriptionDunning,
}));

vi.mock("../services/billing/wallet.service", () => ({
  topUpWallet: h.topUpWallet,
}));

let selectQueue: unknown[][] = [];
vi.mock("../db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectQueue.shift() ?? []),
        }),
      }),
    }),
  }),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { processStripeEvent } from "../services/billing/stripeWebhookProcessor";

function subscriptionPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    current_period_start: 1_700_000_000,
    current_period_end: 1_700_600_000,
    trial_end: null,
    items: { data: [{ price: { id: "price_1", product: "prod_1" } }] },
    ...overrides,
  };
}

describe("processStripeEvent (billing webhook processor)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue = [];
    process.env.STRIPE_SECRET_KEY = "sk_test";
  });

  describe("checkout.session.completed", () => {
    it("retrieves the subscription and upserts it for a user-owned checkout", async () => {
      h.subscriptionsRetrieve.mockResolvedValue(subscriptionPayload());

      await processStripeEvent("checkout.session.completed", {
        mode: "subscription",
        customer: "cus_1",
        subscription: "sub_1",
        metadata: { userId: "user-1" },
      });

      expect(h.subscriptionsRetrieve).toHaveBeenCalledWith("sub_1");
      expect(h.upsertCheckoutSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          orgId: null,
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
          status: "active",
        })
      );
    });

    it("attributes an org checkout to the org, not the creating user", async () => {
      h.subscriptionsRetrieve.mockResolvedValue(subscriptionPayload());

      await processStripeEvent("checkout.session.completed", {
        mode: "subscription",
        customer: "cus_1",
        subscription: "sub_1",
        metadata: { userId: "user-1", orgId: "org-1" },
      });

      expect(h.upsertCheckoutSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null, orgId: "org-1" })
      );
    });

    it("ignores non-subscription checkout modes", async () => {
      await processStripeEvent("checkout.session.completed", {
        mode: "payment",
        customer: "cus_1",
        subscription: null,
        metadata: { userId: "user-1" },
      });

      expect(h.subscriptionsRetrieve).not.toHaveBeenCalled();
      expect(h.upsertCheckoutSubscription).not.toHaveBeenCalled();
    });

    it("ignores a session with no user or org metadata", async () => {
      await processStripeEvent("checkout.session.completed", {
        mode: "subscription",
        customer: "cus_1",
        subscription: "sub_1",
        metadata: {},
      });

      expect(h.subscriptionsRetrieve).not.toHaveBeenCalled();
      expect(h.upsertCheckoutSubscription).not.toHaveBeenCalled();
    });
  });

  describe("customer.subscription.updated / .deleted", () => {
    it("applies a lifecycle update for an active subscription", async () => {
      await processStripeEvent("customer.subscription.updated", subscriptionPayload());

      expect(h.applySubscriptionLifecycleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ stripeSubscriptionId: "sub_1", status: "active", plan: "pro" })
      );
    });

    it("marks the subscription canceled and stamps canceledAt on deletion", async () => {
      await processStripeEvent("customer.subscription.deleted", subscriptionPayload());

      expect(h.applySubscriptionLifecycleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "canceled", plan: "free", canceledAt: expect.any(Date) })
      );
    });
  });

  describe("invoice.payment_failed", () => {
    it("records a payment failure for a known subscription", async () => {
      selectQueue = [[{ id: "internal-sub-1", status: "active", metadata: {} }]];

      await processStripeEvent("invoice.payment_failed", { subscription: "sub_1" });

      expect(h.recordInvoicePaymentFailure).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionId: "internal-sub-1", wasAlreadyPastDue: false })
      );
    });

    it("is a no-op when the invoice has no subscription", async () => {
      await processStripeEvent("invoice.payment_failed", { subscription: null });
      expect(h.recordInvoicePaymentFailure).not.toHaveBeenCalled();
    });

    it("is a no-op when the subscription is not found locally", async () => {
      selectQueue = [[]];
      await processStripeEvent("invoice.payment_failed", { subscription: "sub_missing" });
      expect(h.recordInvoicePaymentFailure).not.toHaveBeenCalled();
    });
  });

  describe("invoice.payment_succeeded", () => {
    it("clears dunning when a past_due subscription recovers", async () => {
      selectQueue = [[{ id: "internal-sub-1", status: "past_due" }]];

      await processStripeEvent("invoice.payment_succeeded", { subscription: "sub_1" });

      expect(h.clearSubscriptionDunning).toHaveBeenCalledWith({ subscriptionId: "internal-sub-1" });
    });

    it("is a no-op when the subscription was not past_due", async () => {
      selectQueue = [[{ id: "internal-sub-1", status: "active" }]];

      await processStripeEvent("invoice.payment_succeeded", { subscription: "sub_1" });

      expect(h.clearSubscriptionDunning).not.toHaveBeenCalled();
    });
  });

  describe("payment_intent.succeeded", () => {
    it("credits the wallet for a wallet top-up payment intent", async () => {
      await processStripeEvent("payment_intent.succeeded", {
        id: "pi_wallet_1",
        amount: 2500,
        metadata: { userId: "user-1", purpose: "wallet_top_up" },
      });

      expect(h.topUpWallet).toHaveBeenCalledWith("user-1", 2500, {
        stripePaymentIntentId: "pi_wallet_1",
        description: "Wallet top-up",
      });
    });

    it("ignores payment intents without wallet top-up metadata", async () => {
      await processStripeEvent("payment_intent.succeeded", {
        id: "pi_other",
        amount: 1000,
        metadata: { userId: "user-1", purpose: "other" },
      });

      expect(h.topUpWallet).not.toHaveBeenCalled();
    });
  });

  it("logs and no-ops for an unhandled event type", async () => {
    await expect(processStripeEvent("customer.updated", {})).resolves.toBeUndefined();
    expect(h.applySubscriptionLifecycleUpdate).not.toHaveBeenCalled();
  });
});
