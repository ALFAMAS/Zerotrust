/**
 * Operational alerting — error-spike and latency-breach detection.
 * Counts 5xx responses and slow requests in a sliding window; when a
 * threshold is crossed, dispatches to the configured notification channels
 * (Slack / Teams / PagerDuty via notificationDispatcher) with a cooldown so
 * channels aren't flooded.
 *
 *   ALERT_ERROR_THRESHOLD=20      5xx responses per window (default 20)
 *   ALERT_WINDOW_SECS=60          sliding window (default 60s)
 *   ALERT_LATENCY_MS=5000         slow-request threshold (default 5s)
 *   ALERT_LATENCY_COUNT=10        slow requests per window before alerting
 *   ALERT_COOLDOWN_SECS=300       min seconds between repeat alerts
 */

import { createMiddleware } from "hono/factory";
import { getLogger } from "../../logger/index";
import { notificationDispatcher } from "../../notifications/index";
import type { HonoEnv } from "../../shared/types";

const logger = getLogger("alerting");

const errorTimestamps: number[] = [];
const slowTimestamps: number[] = [];
let lastErrorAlertAt = 0;
let lastLatencyAlertAt = 0;

function cfg() {
  return {
    errorThreshold: parseInt(process.env.ALERT_ERROR_THRESHOLD ?? "20", 10),
    windowMs: parseInt(process.env.ALERT_WINDOW_SECS ?? "60", 10) * 1000,
    latencyMs: parseInt(process.env.ALERT_LATENCY_MS ?? "5000", 10),
    latencyCount: parseInt(process.env.ALERT_LATENCY_COUNT ?? "10", 10),
    cooldownMs: parseInt(process.env.ALERT_COOLDOWN_SECS ?? "300", 10) * 1000,
  };
}

function prune(list: number[], windowMs: number, now: number) {
  while (list.length > 0 && list[0] < now - windowMs) list.shift();
}

/** Record one server error; fires an alert when the threshold is crossed. */
export function recordServerError(context: { path?: string; status?: number } = {}): void {
  const { errorThreshold, windowMs, cooldownMs } = cfg();
  const now = Date.now();
  errorTimestamps.push(now);
  prune(errorTimestamps, windowMs, now);

  if (errorTimestamps.length >= errorThreshold && now - lastErrorAlertAt > cooldownMs) {
    lastErrorAlertAt = now;
    logger.error(`Error spike: ${errorTimestamps.length} 5xx in ${windowMs / 1000}s`, {
      lastPath: context.path,
    });
    void notificationDispatcher.dispatch("error.spike", {
      count: errorTimestamps.length,
      windowSeconds: windowMs / 1000,
      lastPath: context.path,
      lastStatus: context.status,
      hostname: process.env.HOSTNAME ?? "api",
    });
  }
}

/** Record one slow request; fires an alert when the threshold is crossed. */
export function recordSlowRequest(durationMs: number, path?: string): void {
  const { latencyCount, windowMs, cooldownMs } = cfg();
  const now = Date.now();
  slowTimestamps.push(now);
  prune(slowTimestamps, windowMs, now);

  if (slowTimestamps.length >= latencyCount && now - lastLatencyAlertAt > cooldownMs) {
    lastLatencyAlertAt = now;
    logger.warn(`Latency breach: ${slowTimestamps.length} slow requests`, {
      durationMs,
      path,
    });
    void notificationDispatcher.dispatch("latency.breach", {
      count: slowTimestamps.length,
      windowSeconds: windowMs / 1000,
      thresholdMs: cfg().latencyMs,
      lastDurationMs: durationMs,
      lastPath: path,
    });
  }
}

/** Hono middleware: observes response status + duration on every request. */
export function alertingMiddleware() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    if (c.res.status >= 500) {
      recordServerError({ path: c.req.path, status: c.res.status });
    }
    if (duration >= cfg().latencyMs) {
      recordSlowRequest(duration, c.req.path);
    }
  });
}

/** Test helper. */
export function resetAlertingState(): void {
  errorTimestamps.length = 0;
  slowTimestamps.length = 0;
  lastErrorAlertAt = 0;
  lastLatencyAlertAt = 0;
}
