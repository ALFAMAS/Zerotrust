/**
 * BullMQ offload for Stripe webhook processing (todo.md P3.3).
 *
 * The webhook route (billing.webhooks.ts) always verifies the signature and
 * claims the event's idempotency key synchronously — that must happen inline
 * so a replay/duplicate is rejected immediately. The "heavy" part — a Stripe
 * API `subscriptions.retrieve` call plus the Postgres write — is what this
 * queue moves off the request path when Redis is configured, so Stripe gets a
 * fast ack and the API process isn't blocked on a Stripe round-trip.
 *
 * Producer and consumer are initialized separately because the HTTP endpoint
 * (producer) only ever runs in the API process, while the consumer runs
 * wherever background jobs run: the dedicated worker (WORKER_MODE=true) or,
 * in single-process deployments, the API process itself. See
 * src/api/server.ts and src/worker.ts.
 */
import { Queue, Worker } from "bullmq";
import { releaseStripeEvent } from "../../db/repositories/stripeEvents.repository";
import { getLogger } from "../../logger/index";
import { processStripeEvent } from "./stripeWebhookProcessor";

const logger = getLogger("stripe-webhook-queue");

// BullMQ v5 disallows ":" in queue names (it's the Redis key separator).
const QUEUE_NAME = "zerotrust-stripe-webhooks";

export interface StripeWebhookJobData {
  eventId: string;
  type: string;
  object: unknown;
}

let _queue: Queue<StripeWebhookJobData> | null = null;
let _worker: Worker<StripeWebhookJobData> | null = null;

function parseRedisUri(uri: string): { host: string; port: number; password?: string } | null {
  try {
    const url = new URL(uri);
    return {
      host: url.hostname,
      port: parseInt(url.port || "6379", 10),
      password: url.password ? decodeURIComponent(url.password) : undefined,
    };
  } catch {
    return null;
  }
}

export function getStripeWebhookQueue(): Queue<StripeWebhookJobData> | null {
  return _queue;
}

/** Producer: enables enqueueing. Call in the API process (webhooks arrive there). */
export function initStripeWebhookQueueProducer(redisUri: string): void {
  if (_queue) return;
  const conn = parseRedisUri(redisUri);
  if (!conn) {
    logger.warn("Cannot parse REDIS_URI — Stripe webhook queue producer disabled");
    return;
  }
  _queue = new Queue<StripeWebhookJobData>(QUEUE_NAME, {
    connection: conn,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
    },
  });
  logger.info("Stripe webhook queue producer initialized", { queue: QUEUE_NAME });
}

/** Consumer: processes queued events. Call wherever background jobs run. */
export function initStripeWebhookQueueConsumer(redisUri: string): void {
  if (_worker) return;
  const conn = parseRedisUri(redisUri);
  if (!conn) {
    logger.warn("Cannot parse REDIS_URI — Stripe webhook queue consumer disabled");
    return;
  }

  _worker = new Worker<StripeWebhookJobData>(
    QUEUE_NAME,
    async (job) => {
      await processStripeEvent(job.data.type, job.data.object);
    },
    { connection: conn, concurrency: 5 }
  );

  _worker.on("completed", (job) => {
    logger.info("Stripe webhook job completed", {
      jobId: job.id,
      eventId: job.data.eventId,
      type: job.data.type,
    });
  });

  _worker.on("failed", (job, err) => {
    if (!job) {
      logger.error("Stripe webhook job failed (no job context)", err as Error);
      return;
    }
    const attemptsMax = job.opts.attempts ?? 1;
    logger.error(
      `Stripe webhook job ${job.id} (event ${job.data.eventId}, type ${job.data.type}) failed ` +
        `(attempt ${job.attemptsMade}/${attemptsMax}): ${(err as Error).message}`,
      err as Error
    );
    if (job.attemptsMade >= attemptsMax) {
      // Retries exhausted. Stripe already received a 200 ack, so it will not
      // redeliver on its own — release the idempotency claim so a manual
      // replay from the Stripe dashboard (or an operator-triggered retry) can
      // reprocess it, instead of the event being stuck "processed" forever
      // with no subscription mutation ever applied.
      releaseStripeEvent(job.data.eventId).catch((releaseErr: unknown) =>
        logger.error(
          "Failed to release Stripe event claim after exhausted retries",
          releaseErr as Error
        )
      );
    }
  });

  logger.info("Stripe webhook queue consumer initialized", { queue: QUEUE_NAME });
}

/** Enqueue an event for async processing. Returns false if no producer is configured. */
export async function enqueueStripeWebhookEvent(data: StripeWebhookJobData): Promise<boolean> {
  if (!_queue) return false;
  try {
    await _queue.add(data.type, data);
    return true;
  } catch (err) {
    logger.error(`Failed to enqueue Stripe webhook event ${data.eventId}`, err as Error);
    return false;
  }
}

export async function shutdownStripeWebhookQueue(): Promise<void> {
  try {
    await _worker?.close();
    await _queue?.close();
  } catch {
    // ignore shutdown errors
  }
  _worker = null;
  _queue = null;
}
