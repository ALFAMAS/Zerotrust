import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture what the scheduler registers/consumes so tests can drive the
// BullMQ Worker processor directly, mirroring emailQueue.test.ts /
// stripeWebhookQueue.test.ts's BullMQ mock pattern.
let capturedProcessor: ((job: unknown) => Promise<void>) | null = null;
let capturedHandlers: Record<string, (...args: unknown[]) => void> = {};
let upsertJobSchedulerCalls: unknown[][] = [];

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(function () {
    return {
      upsertJobScheduler: vi.fn(async (...args: unknown[]) => {
        upsertJobSchedulerCalls.push(args);
        return { id: "sched-1" };
      }),
      getFailed: vi.fn().mockResolvedValue([]),
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

// In-memory fake of the Redis sorted-set idempotency store (zadd NX-like
// semantics aren't needed here — the scheduler now does zscore-then-zadd).
const zsets = new Map<string, Map<string, number>>();

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      zscore: vi.fn(async (key: string, member: string) => {
        const set = zsets.get(key);
        const score = set?.get(member);
        return score === undefined ? null : String(score);
      }),
      zadd: vi.fn(async (key: string, score: number, member: string) => {
        if (!zsets.has(key)) zsets.set(key, new Map());
        zsets.get(key)!.set(member, score);
        return 1;
      }),
      zremrangebyscore: vi.fn(async () => 0),
      quit: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const mockRunRetentionPolicies = vi.fn().mockResolvedValue({});
vi.mock("../services/compliance/dataRetention", () => ({
  runRetentionPolicies: (...args: unknown[]) => mockRunRetentionPolicies(...args),
}));

const mockSendNotificationEmailFallbacks = vi.fn().mockResolvedValue(0);
vi.mock("../services/notifications/notificationEmailFallback", () => ({
  sendNotificationEmailFallbacks: (...args: unknown[]) => mockSendNotificationEmailFallbacks(...args),
}));

const mockRunBillingLifecycle = vi.fn().mockResolvedValue({});
vi.mock("../services/billing/billingLifecycle.service", () => ({
  runBillingLifecycle: (...args: unknown[]) => mockRunBillingLifecycle(...args),
}));

const mockRunBackup = vi.fn().mockResolvedValue({ ok: true, pruned: [] });
vi.mock("../services/ops/dbBackup.service", () => ({
  runBackup: (...args: unknown[]) => mockRunBackup(...args),
}));

const mockRunAuditAnchor = vi.fn().mockResolvedValue({ ok: true });
vi.mock("../audit/anchor", () => ({
  runAuditAnchor: (...args: unknown[]) => mockRunAuditAnchor(...args),
}));

function fakeJob(name: string, data: Record<string, unknown> = {}, attemptsMade = 0) {
  return { name, data, attemptsMade, id: `job-${name}` };
}

describe("BullMQ-backed job scheduler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedHandlers = {};
    upsertJobSchedulerCalls = [];
    zsets.clear();
    delete process.env.BACKUP_ENABLED;
  });

  describe("startJobScheduler", () => {
    it("skips entirely when no REDIS_URI is provided", async () => {
      const { startJobScheduler, getScheduledJobQueue } = await import("../jobs/scheduler");
      await startJobScheduler(undefined);
      expect(getScheduledJobQueue()).toBeNull();
      expect(capturedProcessor).toBeNull();
    });

    it("skips when REDIS_URI cannot be parsed", async () => {
      const { startJobScheduler, getScheduledJobQueue } = await import("../jobs/scheduler");
      await startJobScheduler("not-a-valid-uri");
      expect(getScheduledJobQueue()).toBeNull();
    });

    it("upserts a BullMQ job scheduler for every interval job in the registry", async () => {
      const { startJobScheduler, getScheduledJobQueue } = await import("../jobs/scheduler");
      const { JOB_REGISTRY } = await import("../jobs/registry");

      await startJobScheduler("redis://localhost:6379");

      expect(getScheduledJobQueue()).not.toBeNull();
      const intervalJobs = JOB_REGISTRY.filter((j) => j.intervalHours);
      expect(upsertJobSchedulerCalls).toHaveLength(intervalJobs.length);
      for (const jobDef of intervalJobs) {
        const call = upsertJobSchedulerCalls.find(([id]) => id === jobDef.name);
        expect(call).toBeDefined();
        expect(call?.[1]).toEqual({ every: jobDef.intervalHours! * 3600 * 1000 });
      }
      expect(capturedProcessor).not.toBeNull();
    });
  });

  describe("processScheduledJob dispatch", () => {
    it("dispatches retention.purge to runRetentionPolicies", async () => {
      const { startJobScheduler, processScheduledJob } = await import("../jobs/scheduler");
      await startJobScheduler("redis://localhost:6379");

      await processScheduledJob(fakeJob("retention.purge") as any);
      expect(mockRunRetentionPolicies).toHaveBeenCalledTimes(1);
    });

    it("dispatches audit.anchor to runAuditAnchor", async () => {
      const { startJobScheduler, processScheduledJob } = await import("../jobs/scheduler");
      await startJobScheduler("redis://localhost:6379");

      await processScheduledJob(fakeJob("audit.anchor") as any);
      expect(mockRunAuditAnchor).toHaveBeenCalledTimes(1);
    });

    it("skips backup.daily when BACKUP_ENABLED is not true", async () => {
      const { startJobScheduler, processScheduledJob } = await import("../jobs/scheduler");
      await startJobScheduler("redis://localhost:6379");

      await processScheduledJob(fakeJob("backup.daily") as any);
      expect(mockRunBackup).not.toHaveBeenCalled();
    });

    it("runs backup.daily when BACKUP_ENABLED=true", async () => {
      process.env.BACKUP_ENABLED = "true";
      const { startJobScheduler, processScheduledJob } = await import("../jobs/scheduler");
      await startJobScheduler("redis://localhost:6379");

      await processScheduledJob(fakeJob("backup.daily") as any);
      expect(mockRunBackup).toHaveBeenCalledTimes(1);
    });

    it("logs and no-ops for an unknown job name", async () => {
      const { startJobScheduler, processScheduledJob } = await import("../jobs/scheduler");
      await startJobScheduler("redis://localhost:6379");

      await expect(processScheduledJob(fakeJob("does.not.exist") as any)).resolves.toBeUndefined();
    });
  });

  describe("idempotent replay", () => {
    it("does not re-run audit.anchor once the same idempotency key is marked complete", async () => {
      const { startJobScheduler, processScheduledJob } = await import("../jobs/scheduler");
      await startJobScheduler("redis://localhost:6379");

      const job = fakeJob("audit.anchor");
      await processScheduledJob(job as any);
      await processScheduledJob(job as any); // replay — same idempotency key (same day)

      expect(mockRunAuditAnchor).toHaveBeenCalledTimes(1);
    });

    it("runs jobs without an idempotencyKey builder every tick (no dedupe)", async () => {
      const { startJobScheduler, processScheduledJob } = await import("../jobs/scheduler");
      await startJobScheduler("redis://localhost:6379");

      const job = fakeJob("retention.purge");
      await processScheduledJob(job as any);
      await processScheduledJob(job as any);

      expect(mockRunRetentionPolicies).toHaveBeenCalledTimes(2);
    });
  });

  describe("failure recovery", () => {
    it("does not mark a failed attempt complete, so a retry re-executes the handler", async () => {
      mockRunAuditAnchor.mockRejectedValueOnce(new Error("transient failure"));
      const { startJobScheduler, processScheduledJob } = await import("../jobs/scheduler");
      await startJobScheduler("redis://localhost:6379");

      const job = fakeJob("audit.anchor", {}, 0);
      await expect(processScheduledJob(job as any)).rejects.toThrow("transient failure");

      // Simulate BullMQ's retry: same idempotency key, next attempt succeeds.
      const retryJob = fakeJob("audit.anchor", {}, 1);
      await processScheduledJob(retryJob as any);

      expect(mockRunAuditAnchor).toHaveBeenCalledTimes(2);
    });

    it("logs the failed-job event for dead-letter visibility", async () => {
      const { startJobScheduler } = await import("../jobs/scheduler");
      await startJobScheduler("redis://localhost:6379");

      const failedHandler = capturedHandlers.failed;
      expect(failedHandler).toBeDefined();

      expect(() =>
        failedHandler(
          { id: "job-1", name: "audit.anchor", attemptsMade: 3, opts: { attempts: 3 } },
          new Error("exhausted")
        )
      ).not.toThrow();
    });
  });

  describe("getFailedScheduledJobs", () => {
    it("returns an empty array before the queue is initialized", async () => {
      const { getFailedScheduledJobs } = await import("../jobs/scheduler");
      expect(await getFailedScheduledJobs()).toEqual([]);
    });

    it("delegates to the underlying queue once initialized", async () => {
      const { startJobScheduler, getFailedScheduledJobs } = await import("../jobs/scheduler");
      await startJobScheduler("redis://localhost:6379");
      expect(await getFailedScheduledJobs(10)).toEqual([]);
    });
  });

  describe("shutdownJobScheduler", () => {
    it("closes the worker, queue, and redis connection", async () => {
      const { startJobScheduler, shutdownJobScheduler, getScheduledJobQueue } = await import(
        "../jobs/scheduler"
      );
      await startJobScheduler("redis://localhost:6379");
      expect(getScheduledJobQueue()).not.toBeNull();

      await shutdownJobScheduler();
      expect(getScheduledJobQueue()).toBeNull();
    });
  });
});
