"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmailQueue = getEmailQueue;
exports.initEmailQueue = initEmailQueue;
exports.enqueueEmail = enqueueEmail;
exports.shutdownEmailQueue = shutdownEmailQueue;
const bullmq_1 = require("bullmq");
const index_1 = require("../../logger/index");
const logger = (0, index_1.getLogger)("email-queue");
// BullMQ v5 disallows ":" in queue names (it's the Redis key separator).
const QUEUE_NAME = "zerotrust-email";
let _queue = null;
let _worker = null;
function parseRedisUri(uri) {
    try {
        const url = new URL(uri);
        return {
            host: url.hostname,
            port: parseInt(url.port || "6379", 10),
            password: url.password ? decodeURIComponent(url.password) : undefined,
        };
    }
    catch {
        return null;
    }
}
function getEmailQueue() {
    return _queue;
}
async function initEmailQueue(redisUri) {
    const conn = parseRedisUri(redisUri);
    if (!conn) {
        logger.warn("Cannot parse REDIS_URI — email queue disabled");
        return;
    }
    _queue = new bullmq_1.Queue(QUEUE_NAME, {
        connection: conn,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    });
    _worker = new bullmq_1.Worker(QUEUE_NAME, async (job) => {
        const { type, to, payload } = job.data;
        // Dynamic import avoids circular dependency
        const svc = await import("./email.service.js");
        // The queue serializes payloads through JSON (BullMQ), erasing their
        // original type — each case below casts to the target function's own
        // parameter type (via `Parameters<>`, not `any`) so the cast stays
        // correct if that function's signature changes, and every other
        // argument on the call stays type-checked.
        switch (type) {
            case "welcome":
                await svc.sendWelcomeEmail(to, payload);
                break;
            case "magic-link":
                await svc.sendMagicLinkEmail(to, payload);
                break;
            case "otp":
                await svc.sendOtpEmail(to, payload);
                break;
            case "password-reset":
                await svc.sendPasswordResetEmail(to, payload);
                break;
            case "security-alert":
                await svc.sendSecurityAlertEmail(to, payload);
                break;
            case "notification":
                await svc.sendNotificationEmail(to, payload);
                break;
            default:
                logger.warn("Unknown email job type", { type });
        }
    }, { connection: conn, concurrency: 5 });
    _worker.on("completed", (job) => {
        logger.info("Email job completed", {
            jobId: job.id,
            type: job.data.type,
            to: job.data.to,
        });
    });
    _worker.on("failed", (job, err) => {
        logger.error(`Email job ${job?.id ?? "?"} failed: ${err.message}`, err);
    });
    logger.info("Email queue initialized", { queue: QUEUE_NAME });
}
async function enqueueEmail(type, to, payload) {
    if (!_queue)
        return false;
    try {
        await _queue.add(type, { type, to, payload });
        return true;
    }
    catch (err) {
        logger.error("Failed to enqueue email", err);
        return false;
    }
}
async function shutdownEmailQueue() {
    try {
        await _worker?.close();
        await _queue?.close();
    }
    catch {
        // ignore shutdown errors
    }
    _worker = null;
    _queue = null;
}
//# sourceMappingURL=emailQueue.js.map