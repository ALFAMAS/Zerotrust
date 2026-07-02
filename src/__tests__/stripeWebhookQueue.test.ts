import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture the processor fn and event handlers passed to `new Worker(...)` so
// tests can drive them directly, mirroring emailQueue.test.ts's BullMQ mock.
let capturedProcessor: ((job: any) => Promise<void>) | null = null;
let capturedHandlers: Record<string, (...args: any[]) => void> = {};

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(function () {
    return {
      add: vi.fn().mockResolvedValue({ id: "job-1" }),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
  Worker: vi.fn().mockImplementation(function (_name: string, processor: any) {
    capturedProcessor = processor;
    const instance = {
      on: vi.fn((event: string, handler: any) => {
        capturedHandlers[event] = handler;
        return instance;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    return instance;
  }),
}));

const mockProcessStripeEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/billing/stripeWebhookProcessor", () => ({
  processStripeEvent: (...args: unknown[]) => mockProcessStripeEvent(...args),
}));

const mockReleaseStripeEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("../db/repositories/stripeEvents.repository", () => ({
  releaseStripeEvent: (...args: unknown[]) => mockReleaseStripeEvent(...args),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

describe("Stripe webhook queue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedHandlers = {};
  });

  describe("producer", () => {
    it("returns null before initialization", async () => {
      const { getStripeWebhookQueue } = await import("../services/billing/stripeWebhookQueue");
      expect(getStripeWebhookQueue()).toBeNull();
    });

    it("enqueueStripeWebhookEvent returns false when producer is not initialized", async () => {
      const { enqueueStripeWebhookEvent } = await import("../services/billing/stripeWebhookQueue");
      const result = await enqueueStripeWebhookEvent({
        eventId: "evt_1",
        type: "customer.subscription.updated",
        object: {},
      });
      expect(result).toBe(false);
    });

    it("initializes and enqueues after producer init", async () => {
      const { initStripeWebhookQueueProducer, enqueueStripeWebhookEvent, getStripeWebhookQueue } =
        await import("../services/billing/stripeWebhookQueue");

      initStripeWebhookQueueProducer("redis://localhost:6379");
      expect(getStripeWebhookQueue()).not.toBeNull();

      const result = await enqueueStripeWebhookEvent({
        eventId: "evt_1",
        type: "customer.subscription.updated",
        object: {},
      });
      expect(result).toBe(true);
    });

    it("gracefully skips producer init for an invalid redis URI", async () => {
      const { initStripeWebhookQueueProducer, getStripeWebhookQueue } = await import(
        "../services/billing/stripeWebhookQueue"
      );
      initStripeWebhookQueueProducer("not-a-valid-uri");
      expect(getStripeWebhookQueue()).toBeNull();
    });
  });

  describe("consumer", () => {
    it("processes a job by delegating to processStripeEvent", async () => {
      const { initStripeWebhookQueueConsumer } = await import("../services/billing/stripeWebhookQueue");
      initStripeWebhookQueueConsumer("redis://localhost:6379");
      expect(capturedProcessor).not.toBeNull();

      await capturedProcessor?.({
        data: { eventId: "evt_1", type: "customer.subscription.updated", object: { id: "sub_1" } },
      });

      expect(mockProcessStripeEvent).toHaveBeenCalledWith("customer.subscription.updated", {
        id: "sub_1",
      });
    });

    it("does not release the idempotency claim while retries remain", async () => {
      const { initStripeWebhookQueueConsumer } = await import("../services/billing/stripeWebhookQueue");
      initStripeWebhookQueueConsumer("redis://localhost:6379");
      const failedHandler = capturedHandlers.failed;
      expect(failedHandler).toBeDefined();

      failedHandler(
        { id: "job-1", data: { eventId: "evt_1", type: "x" }, attemptsMade: 1, opts: { attempts: 5 } },
        new Error("transient")
      );
      await new Promise((r) => setImmediate(r));

      expect(mockReleaseStripeEvent).not.toHaveBeenCalled();
    });

    it("releases the idempotency claim once retries are exhausted", async () => {
      const { initStripeWebhookQueueConsumer } = await import("../services/billing/stripeWebhookQueue");
      initStripeWebhookQueueConsumer("redis://localhost:6379");
      const failedHandler = capturedHandlers.failed;

      failedHandler(
        { id: "job-2", data: { eventId: "evt_2", type: "x" }, attemptsMade: 5, opts: { attempts: 5 } },
        new Error("permanent")
      );
      await new Promise((r) => setImmediate(r));

      expect(mockReleaseStripeEvent).toHaveBeenCalledWith("evt_2");
    });
  });
});
