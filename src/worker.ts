/**
 * Dedicated worker entrypoint for zerotrust background jobs.
 *
 * Start with:  bun run src/worker.ts
 *
 * This process owns:
 *   - The BullMQ email queue consumer
 *   - The BullMQ Stripe webhook queue consumer (the API process only
 *     produces — the HTTP endpoint lives there — this process consumes)
 *   - The BullMQ scheduled-job scheduler + consumer (retention, billing
 *     lifecycle, notification fallback, daily backup, audit anchor) — see
 *     `src/jobs/scheduler.ts` for the BullMQ job-scheduler + retry/backoff
 *     details.
 *
 * Only ONE worker instance should run at a time. BullMQ delivers each
 * scheduled job to exactly one consumer, so running more than one worker is
 * a topology guardrail (see docs/deployment.md), not a correctness
 * requirement.
 *
 * When this worker is running, the API process (server.ts) detects it via
 * the WORKER_MODE env flag and skips its own scheduler / queue-consumer
 * startup (it still runs the Stripe webhook queue *producer*, since webhooks
 * always arrive there).
 */
import "dotenv/config";
import { loadSecrets } from "./config/secretsLoader";
import { shutdownJobScheduler, startJobScheduler } from "./jobs/scheduler";
import { getLogger } from "./logger";
import {
  initStripeWebhookQueueConsumer,
  shutdownStripeWebhookQueue,
} from "./services/billing/stripeWebhookQueue";
import { initEmailQueue, shutdownEmailQueue } from "./services/notifications/emailQueue";

const logger = getLogger("worker");

async function shutdown(signal: string): Promise<void> {
  logger.info(`Worker ${signal === "SIGTERM" ? "shutting down" : "interrupted"}`);
  await Promise.allSettled([
    shutdownJobScheduler(),
    shutdownEmailQueue(),
    shutdownStripeWebhookQueue(),
  ]);
  process.exit(0);
}

async function main() {
  logger.info("Worker starting");
  await loadSecrets();

  // Start email queue consumer (BullMQ)
  if (process.env.REDIS_URI) {
    try {
      await initEmailQueue(process.env.REDIS_URI);
      logger.info("Email queue consumer started");
    } catch (err) {
      logger.error("Email queue init failed", err as Error);
    }
    // Consume Stripe webhook jobs enqueued by the API process.
    initStripeWebhookQueueConsumer(process.env.REDIS_URI);
    logger.info("Stripe webhook queue consumer started");
  } else {
    logger.warn("REDIS_URI not set — email queue consumer skipped");
  }

  // Start the BullMQ-backed scheduled-job scheduler + consumer
  await startJobScheduler();
  logger.info("Job scheduler started");

  // Keep the process alive
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("Worker crashed", err as Error);
  process.exit(1);
});
