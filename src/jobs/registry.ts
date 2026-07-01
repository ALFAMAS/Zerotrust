/**
 * Centralized background job registry.
 *
 * Every periodic job in zerotrust is declared here with its name, schedule,
 * a Zod payload schema for type-safe job data, and an optional idempotency
 * key builder. The scheduler (scheduler.ts) reads this registry to know
 * what to run and how to guard against duplicates.
 *
 * Jobs that should only run on a single instance (leader-elected) set
 * `singleInstance: true` — the scheduler acquires a Redis lock before
 * dispatching them.
 */
import { z } from "zod";

export interface JobDef {
  /** Unique job name (used in logs, metrics, lock keys). */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Cron-style interval: 24 for every 24h, etc. When absent the job is on-demand only. */
  intervalHours?: number;
  /** Whether this job must run on exactly one instance (leader-elected). */
  singleInstance: boolean;
  /** Zod schema for the job payload. */
  schema: z.ZodTypeAny;
  /**
   * Build an idempotency key from the payload. The scheduler records
   * completed keys so replays/crashes before ack don't re-execute.
   */
  idempotencyKey?: (payload: unknown) => string;
}

/** All registered background jobs. */
export const JOB_REGISTRY: JobDef[] = [
  {
    name: "retention.purge",
    description:
      "Purge data past retention window (GDPR soft-delete, expired tokens, old audit logs)",
    intervalHours: 24,
    singleInstance: true,
    schema: z.object({}),
  },
  {
    name: "notifications.emailFallback",
    description: "Send notification email digests to users who haven't seen in-app notifications",
    intervalHours: 24,
    singleInstance: true,
    schema: z.object({}),
  },
  {
    name: "billing.lifecycle",
    description: "Trial expiry, dunning (D3/D7/D14), win-back (D7/D30/D90) emails",
    intervalHours: 24,
    singleInstance: true,
    schema: z.object({}),
  },
  {
    name: "backup.daily",
    description: "Daily pg_dump backup with local + S3 retention",
    intervalHours: 24,
    singleInstance: true,
    schema: z.object({}),
  },
] as const;

/** Look up a job definition by name. */
export function getJob(name: string): JobDef | undefined {
  return JOB_REGISTRY.find((j) => j.name === name);
}
