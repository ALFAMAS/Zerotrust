/**
 * Dedicated worker entrypoint for zerotrust background jobs.
 *
 * Start with:  bun run src/worker.ts
 *
 * This process owns:
 *   - The BullMQ email queue consumer
 *   - All scheduled interval jobs (retention, billing lifecycle,
 *     notification fallback, daily backup)
 *
 * Only ONE worker instance should run at a time. The job scheduler
 * uses Redis locks to enforce single-instance for each job tick.
 *
 * When this worker is running, the API process (server.ts) detects
 * it via the WORKER_MODE env flag and skips its own scheduler startup.
 */
import "dotenv/config";
import { startJobScheduler } from "./jobs/scheduler";
import { initEmailQueue } from "./services/emailQueue";
import { getLogger } from "./logger";

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