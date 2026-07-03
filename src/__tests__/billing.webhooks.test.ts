import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared mock fns created via vi.hoisted so they exist before the (hoisted)
// module imports run their mock factories.
const h = vi.hoisted(() => {
  const constructEventAsync = vi.fn();
  const subscriptionsRetrieve = vi.fn();
  const claim = vi.fn();
  const release = vi.fn();
  const applySubscriptionLifecycleUpdate = vi.fn();
  // Defaults to false (no queue configured) so every existing test exercises
  // the synchronous fallback path unchanged; individual tests can override.
  const enqueue = vi.fn().mockResolvedValue(false);
  return {
    constructEventAsync,
    subscriptionsRetrieve,
    claim,
    release,
    applySubscriptionLifecycleUpdate,
    enqueue,
  };
});

// Stripe: the handler builds `new Stripe()` and calls webhooks.constructEventAsync.
// Use a normal function (not an arrow) so it is `new`-able as a constructor.
vi.mock("stripe", () => ({
  default: vi.fn(function StripeMock() {
    return {
      webhooks: { constructEventAsync: h.constructEventAsync },
      subscriptions: { retrieve: h.subscriptionsRetrieve },
    };
  }),
}));

// Idempotency repository: drive the claim outcome per test.
vi.mock("../db/repositories/stripeEvents.repository", () => ({
  claimStripeEvent: h.claim,
  releaseStripeEvent: h.release,
}));

vi.mock("../db/repositories/billingSubscriptions.repository", () => ({
  applySubscriptionLifecycleUpdate: (...args: unknown[]) =>
    h.applySubscriptionLifecycleUpdate(...args),
  upsertCheckoutSubscription: vi.fn().mockResolvedValue(undefined),
  clearSubscriptionDunning: vi.fn().mockResolvedValue(undefined),
  recordInvoicePaymentFailure: vi.fn().mockResolvedValue(undefined),
}));

// DB reads for invoice handlers (unused by subscription.updated tests).
vi.mock("../db", () => ({
  getDb: () => ({ select: vi.fn() }),
}));

// Queue offload: defaults to unavailable (see h.enqueue above) so the route
// falls back to synchronous processing unless a test opts into the queued path.
vi.mock("../services/billing/stripeWebhookQueue", () => ({
  enqueueStripeWebhookEvent: (...args: unknown[]) => h.enqueue(...args),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import billingWebhookRoutes from "../api/routes/billing.webhooks";

function app() {
  return new Hono().route("/billing", billingWebhookRoutes);
}

function subscriptionUpdatedEvent(id = "evt_1") {
  return {
    id,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_1",
        items: { data: [{ price: { id: "price_1", product: "prod_1" } }] },
        status: "active",
        current_period_start: 1_700_000_000,
        current_period_end: 1_700_600_000,
        cancel_at_period_end: false,
        trial_end: null,
      },
    },
  };
}

function post(body = "{}", headers: Record<string, string> = { "stripe-signature": "sig_test" }) {
  return app().request("/billing/webhook", { method: "POST", headers, body });
}

describe("POST /billing/webhook — idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.constructEventAsync.mockResolvedValue(subscriptionUpdatedEvent());
    h.applySubscriptionLifecycleUpdate.mockResolvedValue(undefined);
    h.release.mockResolvedValue(undefined);
    h.enqueue.mockResolvedValue(false);
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_SECRET_KEY = "sk_test";
  });

  it("applies a first-seen event and returns received", async () => {
    h.claim.mockResolvedValue(true);

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(h.claim).toHaveBeenCalledWith("evt_1", "customer.subscription.updated");
    expect(h.applySubscriptionLifecycleUpdate).toHaveBeenCalledTimes(1);
    expect(h.release).not.toHaveBeenCalled();
  });

  it("skips a duplicate/replayed event without re-mutating", async () => {
    h.claim.mockResolvedValue(false); // already processed

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(h.applySubscriptionLifecycleUpdate).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });

  it("releases the claim when processing throws so Stripe can retry", async () => {
    h.claim.mockResolvedValue(true);
    h.applySubscriptionLifecycleUpdate.mockRejectedValueOnce(new Error("db down"));

    const res = await post();

    expect(res.status).toBe(500);
    expect(h.release).toHaveBeenCalledWith("evt_1");
  });

  it("rejects a request with no stripe-signature header", async () => {
    const res = await post("{}", {});

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "MISSING_SIGNATURE" });
    expect(h.claim).not.toHaveBeenCalled();
  });

  it("offloads to the queue when available: acks fast without processing inline", async () => {
    h.claim.mockResolvedValue(true);
    h.enqueue.mockResolvedValue(true); // queue accepted the job

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, queued: true });
    expect(h.enqueue).toHaveBeenCalledWith({
      eventId: "evt_1",
      type: "customer.subscription.updated",
      object: expect.objectContaining({ id: "sub_1" }),
    });
    // The mutation is the queue worker's job, not this request's.
    expect(h.applySubscriptionLifecycleUpdate).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });
});
