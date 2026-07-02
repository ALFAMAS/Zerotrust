/**
 * Dedicated worker entrypoint for zerotrust background jobs.
 *
 * Start with:  bun run src/worker.ts
 *
 * This process owns:
 *   - The BullMQ email queue consumer
 *   - The BullMQ Stripe webhook queue consumer (the API process only
 *     produces — the HTTP endpoint lives there — this process consumes)
 *   - All scheduled interval jobs (retention, billing lifecycle,
 *     notification fallback, daily backup)
 *
 * Only ONE worker instance should run at a time. The job scheduler
 * uses Redis locks to enforce single-instance for each job tick.
 *
 * When this worker is running, the API process (server.ts) detects it via
 * the WORKER_MODE env flag and skips its own scheduler / queue-consumer
 * startup (it still runs the Stripe webhook queue *producer*, since webhooks
 * always arrive there).
 */
import "dotenv/config";
import { startJobScheduler } from "./jobs/scheduler";
import { getLogger } from "./logger";
import { initEmailQueue } from "./services/notifications/emailQueue";
import { initStripeWebhookQueueConsumer } from "./services/billing/stripeWebhookQueue";

const logger = getLogger("worker");

async function main() {
  logger.info("Worker starting");

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

  // Start all interval jobs with leader election
  startJobScheduler();
  logger.info("Job scheduler started");

  // Keep the process alive
  process.on("SIGTERM", () => {
    logger.info("Worker shutting down");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    logger.info("Worker interrupted");
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error("Worker crashed", err as Error);
  process.exit(1);
});
