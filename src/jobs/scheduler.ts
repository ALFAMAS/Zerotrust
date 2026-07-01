/**
 * Single-instance job scheduler with Redis leader election.
 *
 * Each job in the registry that sets `singleInstance: true` acquires a Redis
 * lock before executing. When Redis is unavailable (no REDIS_URI), every
 * instance skips — this prevents duplicate execution in cluster mode.
 *
 * On-demand (non-interval) jobs and jobs with `singleInstance: false` are
 * dispatched directly without locking.
 */
import Redis from "ioredis";
import { getLogger } from "../logger";
import { JOB_REGISTRY, type JobDef } from "./registry";

const logger = getLogger("jobs-scheduler");
const LOCK_PREFIX = "zerotrust:job:lock:";
const DEFAULT_LOCK_TTL = 300; // 5 minutes — a job that takes longer should extend

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URI) return null;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URI, {
      maxRetriesPerRequest: 2,
      retryStrategy: () => null, // fail fast
    });
  }
  return redis;
}

/**
 * Acquire a distributed lock for a job. Returns true if the lock was acquired
 * (this instance is the leader for this tick), false if another instance holds
 * the lock.
 */
async function acquireLock(jobName: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false; // no Redis → no leader → skip
  const key = `${LOCK_PREFIX}${jobName}`;
  const result = await r.set(key, "1", "PX", DEFAULT_LOCK_TTL * 1000, "NX");
  return result === "OK";
}

/** Release a lock after job completion. */
async function releaseLock(jobName: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.del(`${LOCK_PREFIX}${jobName}`);
}

/**
 * Track completed job ticks for idempotency. Uses a Redis sorted set:
 *   key = zerotrust:job:completed:<name>
 *   member = idempotency key
 *   score = timestamp
 * Auto-expires entries older than 7 days.
 */
async function isDuplicate(jobDef: JobDef, payload: unknown): Promise<boolean> {
  if (!jobDef.idempotencyKey) return false;
  const r = getRedis();
  if (!r) return false;
  const key = `zerotrust:job:completed:${jobDef.name}`;
  const idKey = jobDef.idempotencyKey(payload);
  const added = await r.zadd(key, "NX", Date.now(), idKey);
  if (added === 0) return true; // already present
  // Trim old entries
  await r.zremrangebyscore(key, 0, Date.now() - 7 * 24 * 3600 * 1000);
  return false;
}

/** Start all interval jobs from the registry. */
export function startJobScheduler() {
  const hasRedis = !!process.env.REDIS_URI;

  for (const jobDef of JOB_REGISTRY) {
    if (!jobDef.intervalHours) continue; // on-demand only

    const intervalMs = jobDef.intervalHours * 3600 * 1000;
    logger.info("Registering job", {
      job: jobDef.name,
      intervalHours: jobDef.intervalHours,
      singleInstance: jobDef.singleInstance,
    });

    setInterval(async () => {
      try {
        if (jobDef.singleInstance && hasRedis) {
          const locked = await acquireLock(jobDef.name);
          if (!locked) {
            logger.debug("Skipping job — lock held by another instance", { job: jobDef.name });
            return;
          }
          try {
            await runJob(jobDef);
          } finally {
            await releaseLock(jobDef.name);
          }
        } else if (jobDef.singleInstance && !hasRedis) {
          logger.debug("Skipping job — no Redis, cannot guarantee single instance", {
            job: jobDef.name,
          });
        } else {
          await runJob(jobDef);
        }
      } catch (err) {
        logger.error("Job scheduler tick failed", { job: jobDef.name, error: String(err) });
      }
    }, intervalMs);
  }

  return {};
}

/** Execute a single job tick. */
async function runJob(jobDef: JobDef) {
  const payload = {}; // Most jobs have no payload; extend when jobs need params
  const dup = await isDuplicate(jobDef, payload);
  if (dup) {
    logger.debug("Skipping duplicate job tick", { job: jobDef.name });
    return;
  }

  logger.info("Running job", { job: jobDef.name });
  // Dynamically import the job handler to avoid bundling all services at boot
  const handled = await dispatchJob(jobDef, payload);
  if (!handled) {
    logger.warn("No handler registered for job", { job: jobDef.name });
  }
}

/**
 * Map job names to their handler functions.
 * Only the scheduled jobs need entries here; on-demand jobs are dispatched
 * elsewhere.
 */
async function dispatchJob(jobDef: JobDef, _payload: unknown): Promise<boolean> {
  switch (jobDef.name) {
    case "retention.purge": {
      const { startRetentionScheduler } = await import("../services/dataRetention.js");
      await startRetentionScheduler(jobDef.intervalHours!);
      return true;
    }
    case "notifications.emailFallback": {
      const { startNotificationEmailFallbackScheduler } = await import(
        "../services/notificationEmailFallback.js"
      );
      await startNotificationEmailFallbackScheduler(jobDef.intervalHours!);
      return true;
    }
    case "billing.lifecycle": {
      const { startBillingLifecycleScheduler } = await import(
        "../services/billingLifecycle.service.js"
      );
      await startBillingLifecycleScheduler(jobDef.intervalHours!);
      return true;
    }
    case "backup.daily": {
      const { startBackupScheduler } = await import("../services/dbBackup.service.js");
      await startBackupScheduler(jobDef.intervalHours!);
      return true;
    }
    default:
      return false;
  }
}
