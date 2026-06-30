import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared mock fns created via vi.hoisted so they exist before the (hoisted)
// module imports run their mock factories.
const h = vi.hoisted(() => {
  const constructEvent = vi.fn();
  const subscriptionsRetrieve = vi.fn();
  const claim = vi.fn();
  const release = vi.fn();
  const whereMock = vi.fn();
  const setMock = vi.fn(() => ({ where: whereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));
  return { constructEvent, subscriptionsRetrieve, claim, release, whereMock, setMock, updateMock };
});

// Stripe: the handler builds `new Stripe()` and calls webhooks.constructEvent.
// Use a normal function (not an arrow) so it is `new`-able as a constructor.
vi.mock("stripe", () => ({
  default: vi.fn(function StripeMock() {
    return {
      webhooks: { constructEvent: h.constructEvent },
      subscriptions: { retrieve: h.subscriptionsRetrieve },
    };
  }),
}));

// Idempotency repository: drive the claim outcome per test.
vi.mock("../db/repositories/stripeEvents.repository", () => ({
  claimStripeEvent: h.claim,
  releaseStripeEvent: h.release,
}));

// DB: a chainable update().set().where() that resolves (or rejects in the error test).
vi.mock("../db", () => ({
  getDb: () => ({ update: h.updateMock, insert: vi.fn(), select: vi.fn() }),
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
    h.constructEvent.mockReturnValue(subscriptionUpdatedEvent());
    h.whereMock.mockResolvedValue(undefined);
    h.release.mockResolvedValue(undefined);
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_SECRET_KEY = "sk_test";
  });

  it("applies a first-seen event and returns received", async () => {
    h.claim.mockResolvedValue(true);

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(h.claim).toHaveBeenCalledWith("evt_1", "customer.subscription.updated");
    expect(h.updateMock).toHaveBeenCalledTimes(1); // the subscription mutation ran
    expect(h.release).not.toHaveBeenCalled();
  });

  it("skips a duplicate/replayed event without re-mutating", async () => {
    h.claim.mockResolvedValue(false); // already processed

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(h.updateMock).not.toHaveBeenCalled(); // no second apply
    expect(h.release).not.toHaveBeenCalled();
  });

  it("releases the claim when processing throws so Stripe can retry", async () => {
    h.claim.mockResolvedValue(true);
    h.whereMock.mockRejectedValueOnce(new Error("db down"));

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
});
