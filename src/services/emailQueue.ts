import { Queue, Worker } from "bullmq";
import { getLogger } from "../logger";

const logger = getLogger("email-queue");

export type EmailJobType =
  | "welcome"
  | "magic-link"
  | "otp"
  | "password-reset"
  | "security-alert"
  | "notification";

export interface EmailJobData {
  type: EmailJobType;
  to: string;
  payload: Record<string, unknown>;
}

// BullMQ v5 disallows ":" in queue names (it's the Redis key separator).
const QUEUE_NAME = "zeroauth-email";

let _queue: Queue<EmailJobData> | null = null;
let _worker: Worker<EmailJobData> | null = null;

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

export function getEmailQueue(): Queue<EmailJobData> | null {
  return _queue;
}

export async function initEmailQueue(redisUri: string): Promise<void> {
  const conn = parseRedisUri(redisUri);
  if (!conn) {
    logger.warn("Cannot parse REDIS_URI — email queue disabled");
    return;
  }

  _queue = new Queue<EmailJobData>(QUEUE_NAME, {
    connection: conn,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

  _worker = new Worker<EmailJobData>(
    QUEUE_NAME,
    async (job) => {
      const { type, to, payload } = job.data;
      // Dynamic import avoids circular dependency
      const svc = await import("./email.service.js");
      switch (type) {
        case "welcome":
          await svc.sendWelcomeEmail(to, payload as any);
          break;
        case "magic-link":
          await svc.sendMagicLinkEmail(to, payload as any);
          break;
        case "otp":
          await svc.sendOtpEmail(to, payload as any);
          break;
        case "password-reset":
          await svc.sendPasswordResetEmail(to, payload as any);
          break;
        case "security-alert":
          await svc.sendSecurityAlertEmail(to, payload as any);
          break;
        case "notification":
          await svc.sendNotificationEmail(to, payload as any);
          break;
        default:
          logger.warn("Unknown email job type", { type });
      }
    },
    { connection: conn, concurrency: 5 }
  );

  _worker.on("completed", (job) => {
    logger.info("Email job completed", { jobId: job.id, type: job.data.type, to: job.data.to });
  });

  _worker.on("failed", (job, err) => {
    logger.error(`Email job ${job?.id ?? "?"} failed: ${(err as Error).message}`, err as Error);
  });

  logger.info("Email queue initialized", { queue: QUEUE_NAME });
}

export async function enqueueEmail(
  type: EmailJobType,
  to: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  if (!_queue) return false;
  try {
    await _queue.add(type, { type, to, payload });
    return true;
  } catch (err) {
    logger.error("Failed to enqueue email", err as Error);
    return false;
  }
}

export async function shutdownEmailQueue(): Promise<void> {
  try {
    await _worker?.close();
    await _queue?.close();
  } catch {
    // ignore shutdown errors
  }
  _worker = null;
  _queue = null;
}
