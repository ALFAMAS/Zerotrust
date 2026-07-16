import type { ConnectionOptions } from "bullmq";

export const QUEUE_NAMES = {
  email: "zerotrust-email",
  scheduledJobs: "zerotrust-scheduled-jobs",
  stripeWebhooks: "zerotrust-stripe-webhooks",
} as const;

export const BULLMQ_QUEUE_NAMES = Object.values(QUEUE_NAMES);

/** Convert an operator-controlled Redis URI into BullMQ connection options. */
export function parseRedisConnection(uri: string): ConnectionOptions | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") return null;

    const port = Number(url.port || 6379);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;

    const databasePath = url.pathname.replace(/^\//, "");
    const db = databasePath ? Number(databasePath) : undefined;
    if (db !== undefined && (!Number.isInteger(db) || db < 0)) return null;

    return {
      host: url.hostname,
      port,
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(db !== undefined ? { db } : {}),
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    };
  } catch {
    return null;
  }
}
