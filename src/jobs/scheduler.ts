/**
 * BullMQ-backed job scheduler (B5 — queue-backed cron scheduling).
 *
 * Jobs declared in the registry with `intervalHours` are scheduled through a
 * BullMQ job scheduler (`Queue.upsertJobScheduler`) instead of `setInterval`.
 * That gets us, for free:
 *   - exactly-one-worker delivery per tick — BullMQ atomically hands each job
 *     to a single consumer, so the old Redis leader lock is no longer needed
 *     to prevent duplicate execution across instances/replicas.
 *   - retry with exponential backoff on failure (`defaultJobOptions` below).
 *   - dead-letter visibility — failed jobs stay in the queue (`getFailed()`)
 *     instead of silently vanishing after a failed `setInterval` tick.
 *
 * Idempotency (registry `idempotencyKey`) still guards against re-running an
 * already-completed tick: the "completed" marker is written to Redis only
 * *after* a successful run, so:
 *   - replaying an already-completed tick is a no-op (idempotent replay)
 *   - a failed attempt is NOT marked complete, so a BullMQ retry actually
 *     re-executes the handler (failure recovery)
 *
 * Without REDIS_URI, BullMQ cannot connect — scheduled jobs are skipped
 * entirely, matching the previous behavior for `singleInstance` jobs (all
 * current registry jobs are single-instance).
 */
import { type Job, Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { getLogger } from "../logger";
import { parseRedisConnection, QUEUE_NAMES } from "./queueConfig";
import { getJob, JOB_REGISTRY, type JobDef } from "./registry";

const logger = getLogger("jobs-scheduler");

// BullMQ v5 disallows ":" in queue names (it's the Redis key separator).
const QUEUE_NAME = QUEUE_NAMES.scheduledJobs;
const IDEMPOTENCY_PREFIX = "zerotrust:job:completed:";
const IDEMPOTENCY_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

let _queue: Queue | null = null;
let _worker: Worker | null = null;
let _redis: Redis | null = null;

/** The underlying BullMQ queue — for ops/admin introspection (e.g. failed-job counts). */
export function getScheduledJobQueue(): Queue | null {
  return _queue;
}

/** Dead-letter visibility: list the most recent failed scheduled-job attempts. */
export async function getFailedScheduledJobs(limit = 20): Promise<Job[]> {
  if (!_queue) return [];
  return _queue.getFailed(0, Math.max(0, limit - 1));
}

async function isAlreadyCompleted(jobDef: JobDef, payload: unknown): Promise<boolean> {
  if (!jobDef.idempotencyKey || !_redis) return false;
  const key = `${IDEMPOTENCY_PREFIX}${jobDef.name}`;
  const idKey = jobDef.idempotencyKey(payload);
  const score = await _redis.zscore(key, idKey);
  return score !== null;
}

async function markCompleted(jobDef: JobDef, payload: unknown): Promise<void> {
  if (!jobDef.idempotencyKey || !_redis) return;
  const key = `${IDEMPOTENCY_PREFIX}${jobDef.name}`;
  const idKey = jobDef.idempotencyKey(payload);
  await _redis.zadd(key, Date.now(), idKey);
  await _redis.zremrangebyscore(key, 0, Date.now() - IDEMPOTENCY_TTL_MS);
}

/**
 * Map job names to their (one-shot) handler functions. Only scheduled jobs
 * need entries here; on-demand jobs are dispatched elsewhere. Handlers are
 * the plain run-once functions (not the legacy `start*Scheduler` wrappers,
 * which own their own `setInterval` and are kept only for direct callers /
 * existing tests) — BullMQ now owns all periodic re-triggering.
 */
async function dispatchJob(jobDef: JobDef, _payload: unknown): Promise<boolean> {
  switch (jobDef.name) {
    case "retention.purge": {
      const { runRetentionPolicies } = await import("../services/compliance/dataRetention.js");
      await runRetentionPolicies();
      return true;
    }
    case "notifications.emailFallback": {
      const { sendNotificationEmailFallbacks } = await import(
        "../services/notifications/notificationEmailFallback.js"
      );
      await sendNotificationEmailFallbacks();
      return true;
    }
    case "billing.lifecycle": {
      const { runBillingLifecycle } = await import(
        "../services/billing/billingLifecycle.service.js"
      );
      await runBillingLifecycle();
      return true;
    }
    case "backup.daily": {
      if (process.env.BACKUP_ENABLED !== "true") {
        logger.info("Skipping DB backup job — BACKUP_ENABLED is not true");
        return true;
      }
      const { runBackup } = await import("../services/ops/dbBackup.service.js");
      await runBackup();
      return true;
    }
    case "audit.anchor": {
      const { runAuditAnchor } = await import("../audit/anchor.js");
      await runAuditAnchor();
      return true;
    }
    case "auth.apiKeyRotation": {
      const { checkApiKeyRotation } = await import("../services/auth/apiKeyRotation.service.js");
      await checkApiKeyRotation();
      return true;
    }
    default:
      return false;
  }
}

/**
 * Execute a single scheduled job tick, honoring idempotency. Exported so
 * tests can drive it directly (mirrors the BullMQ processor callback).
 */
export async function processScheduledJob(job: Job): Promise<void> {
  const jobDef = getJob(job.name);
  if (!jobDef) {
    logger.warn("No registry entry for scheduled job", { job: job.name });
    return;
  }

  if (await isAlreadyCompleted(jobDef, job.data)) {
    logger.info("Skipping already-completed scheduled job (idempotent replay)", {
      job: jobDef.name,
    });
    return;
  }

  logger.info("Running scheduled job", { job: jobDef.name, attempt: job.attemptsMade + 1 });
  const handled = await dispatchJob(jobDef, job.data);
  if (!handled) {
    logger.warn("No handler registered for scheduled job", { job: jobDef.name });
    return;
  }
  await markCompleted(jobDef, job.data);
}

/**
 * Start the BullMQ-backed scheduler: upserts a job scheduler (BullMQ's
 * repeatable-job primitive) for every registry entry with `intervalHours`,
 * then starts the worker that consumes them.
 *
 * Call once per process that should own scheduled jobs — the dedicated
 * worker in production, or the API process in single-process/dev deployments
 * (see `src/jobs/topology.ts`, which gates which process calls this).
 */
export async function startJobScheduler(redisUri = process.env.REDIS_URI): Promise<void> {
  if (!redisUri) {
    logger.warn("REDIS_URI not set — scheduled jobs (BullMQ) will not run");
    return;
  }
  const conn = parseRedisConnection(redisUri);
  if (!conn) {
    logger.warn("Cannot parse REDIS_URI — scheduled jobs (BullMQ) will not run");
    return;
  }

  if (!_redis) {
    _redis = new Redis(redisUri, { maxRetriesPerRequest: 2, retryStrategy: () => null });
  }

  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: 20,
        removeOnFail: 100, // dead-letter visibility — keep recent failures inspectable
      },
    });
  }

  for (const jobDef of JOB_REGISTRY) {
    if (!jobDef.intervalHours) continue; // on-demand only
    await _queue.upsertJobScheduler(
      jobDef.name,
      { every: jobDef.intervalHours * 3600 * 1000 },
      { name: jobDef.name, data: {} }
    );
    logger.info("Registered BullMQ job scheduler", {
      job: jobDef.name,
      intervalHours: jobDef.intervalHours,
    });
  }

  if (!_worker) {
    _worker = new Worker(QUEUE_NAME, processScheduledJob, { connection: conn });

    _worker.on("completed", (job) => {
      logger.info("Scheduled job completed", { jobId: job.id, job: job.name });
    });

    _worker.on("failed", (job, err) => {
      if (!job) {
        logger.error("Scheduled job failed (no job context)", err as Error);
        return;
      }
      const attemptsMax = job.opts.attempts ?? 1;
      logger.error(
        `Scheduled job ${job.id} (${job.name}) failed (attempt ${job.attemptsMade}/${attemptsMax}): ` +
          `${(err as Error).message}`,
        err as Error
      );
    });

    logger.info("Scheduled job worker started", { queue: QUEUE_NAME });
  }
}

/** Graceful shutdown — closes the worker, queue, and idempotency Redis connection. */
export async function shutdownJobScheduler(): Promise<void> {
  try {
    await _worker?.close();
    await _queue?.close();
    await _redis?.quit();
  } catch {
    // ignore shutdown errors
  }
  _worker = null;
  _queue = null;
  _redis = null;
}
