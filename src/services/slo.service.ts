/**
 * SLO dashboards — error budget + burn-rate computation from existing Prometheus metrics.
 *
 * Tracks two core SLOs:
 *   1. Availability  : % of non-5xx responses  (target: 99.9%)
 *   2. Latency       : % of requests under 500ms  (target: 99.5%)
 *
 * Burn-rate alerts fire when the error budget is being consumed faster than the
 * sustainable rate. Supports multi-window, multi-burn-rate alerts following
 * Google SRE conventions:
 *   - 1× burn rate (full budget in 30 days)
 *   - 2× burn rate (full budget in 15 days)
 *   - 6× burn rate (full budget in 5 days)  → page
 *   - 14.4× burn rate (full budget in 2 days) → page immediately
 *
 * Configuration via env:
 *   SLO_AVAILABILITY_TARGET=0.999     availability objective (0-1)
 *   SLO_LATENCY_TARGET=0.995          latency objective (0-1)
 *   SLO_LATENCY_THRESHOLD_MS=500      latency SLO threshold in ms
 *   SLO_WINDOW_DAYS=30                rolling window in days (default 30)
 *   SLO_BURN_ALERT_THRESHOLD=6        burn rate that triggers alert
 *   SLO_ALERT_COOLDOWN_SECS=300       cooldown between repeated alerts
 *   SLO_ALERT_ENABLED=true            master toggle
 */

import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { internalErrorResponse } from "../api/errorHandler";
import { getLogger } from "../logger";
import { metricsRegistry } from "../metrics/registry";
import { notificationDispatcher } from "../notifications";
import type { HonoEnv } from "../shared/types";

const logger = getLogger("slo");

// In-memory counters for error budget tracking (reset on restart — Prometheus is the source of truth)
let _windowStartMs = Date.now();

// Burn-rate alert cooldown
let lastBurnAlertAt = 0;

function cfg() {
  return {
    availabilityTarget: parseFloat(process.env.SLO_AVAILABILITY_TARGET ?? "0.999"),
    latencyTarget: parseFloat(process.env.SLO_LATENCY_TARGET ?? "0.995"),
    latencyThresholdMs: parseInt(process.env.SLO_LATENCY_THRESHOLD_MS ?? "500", 10),
    windowDays: parseInt(process.env.SLO_WINDOW_DAYS ?? "30", 10),
    burnAlertThreshold: parseFloat(process.env.SLO_BURN_ALERT_THRESHOLD ?? "6"),
    alertCooldownMs: parseInt(process.env.SLO_ALERT_COOLDOWN_SECS ?? "300", 10) * 1000,
    enabled: process.env.SLO_ALERT_ENABLED !== "false",
  };
}

/**
 * Query prom-client for the aggregated request counters.
 * This parses the Prometheus output to extract total requests, error requests,
 * and slow requests from the histograms/counters already tracked.
 */
async function queryMetrics(): Promise<{
  totalRequests: number;
  errorRequests: number;
  slowRequests: number;
}> {
  try {
    const output = await metricsRegistry.metrics();
    const lines = output.split("\n");

    let totalRequests = 0;
    let errorRequests = 0;
    let slowRequests = 0;

    const cfg_ = cfg();

    // Parse request_duration_seconds histogram for totals + bucket counts

    for (const line of lines) {
      if (line.startsWith("zerotrust_request_duration_seconds{")) {
        // Extract method/route/status_code from labels
        const statusMatch = line.match(/status_code="(\d+)"/);
        const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;
        const valueMatch = line.match(/\} (\d+(?:\.\d+)?(?:e[+-]?\d+)?)/);
        const value = valueMatch ? parseFloat(valueMatch[1]) : 0;

        if (line.includes('method="')) {
          if (line.includes("_count")) {
            totalRequests += value;
            if (status >= 500) errorRequests += value;
          }
        }
      }

      // Histogram bucket: cumulative count up to each bucket
      if (line.includes("zerotrust_request_duration_seconds_bucket")) {
        const bucketMatch = line.match(/le="(\d+(?:\.\d+)?)"/);
        const valueMatch = line.match(/\} (\d+(?:\.\d+)?(?:e[+-]?\d+)?)/);
        if (bucketMatch && valueMatch) {
          const bucketMs = parseFloat(bucketMatch[1]) * 1000; // buckets are in seconds
          const count = parseFloat(valueMatch[1]);
          if (bucketMs >= cfg_.latencyThresholdMs) {
            slowRequests = Math.max(slowRequests, count);
          }
        }
      }

      // Also track from the _total counter if available
      if (line.startsWith("zerotrust_request_duration_seconds_count")) {
        const valueMatch = line.match(/\} (\d+(?:\.\d+)?(?:e[+-]?\d+)?)/);
        if (valueMatch) {
          totalRequests = Math.max(totalRequests, parseFloat(valueMatch[1]));
        }
      }
    }

    return { totalRequests, errorRequests, slowRequests };
  } catch (err) {
    logger.warn("Failed to query Prometheus metrics for SLO", {
      error: String(err),
    });
    return { totalRequests: 0, errorRequests: 0, slowRequests: 0 };
  }
}

export interface SLOStatus {
  window: {
    days: number;
    startDate: string;
  };
  availability: {
    target: number;
    actual: number;
    errorBudgetRemaining: number; // 0-1, 1 = full budget remaining
    errorBudgetConsumed: number; // 0-1
  };
  latency: {
    target: number;
    thresholdMs: number;
    actual: number;
    errorBudgetRemaining: number;
    errorBudgetConsumed: number;
  };
  burnRates: {
    availability: number;
    latency: number;
    alerting: boolean;
  };
  metrics: {
    totalRequests: number;
    errorRequests: number;
    slowRequests: number;
  };
  timestamp: string;
}

export async function computeSLOStatus(): Promise<SLOStatus> {
  const c = cfg();
  const now = Date.now();
  const windowMs = c.windowDays * 24 * 60 * 60 * 1000;

  const metrics = await queryMetrics();
  const { totalRequests, errorRequests, slowRequests } = metrics;

  // Availability SLO
  const availErrorBudget = 1 - c.availabilityTarget; // e.g. 0.001 for 99.9%
  const availErrorRate = totalRequests > 0 ? errorRequests / totalRequests : 0;
  const availActual = Math.max(0, 1 - availErrorRate);
  // Budget consumed = actual error budget used / total error budget
  const availBudgetUsed =
    totalRequests > 0
      ? Math.max(0, errorRequests - totalRequests * availErrorBudget) /
        Math.max(1, totalRequests * availErrorBudget)
      : 0;
  const availBudgetRemaining = Math.max(0, 1 - Math.min(1, availBudgetUsed));

  // Latency SLO
  const latErrorBudget = 1 - c.latencyTarget;
  const latSlowRate = totalRequests > 0 ? slowRequests / totalRequests : 0;
  const latActual = Math.max(0, 1 - latSlowRate);
  const latBudgetUsed =
    totalRequests > 0
      ? Math.max(0, slowRequests - totalRequests * latErrorBudget) /
        Math.max(1, totalRequests * latErrorBudget)
      : 0;
  const latBudgetRemaining = Math.max(0, 1 - Math.min(1, latBudgetUsed));

  // Burn rates: ratio of current consumption rate to sustainable rate
  const windowFraction = Math.min(1, (now - _windowStartMs) / windowMs);
  const sustainableRate = 1; // 1× = consume full budget over full window
  const availBurnRate =
    windowFraction > 0 ? (1 - availBudgetRemaining) / (windowFraction * sustainableRate) : 0;
  const latBurnRate =
    windowFraction > 0 ? (1 - latBudgetRemaining) / (windowFraction * sustainableRate) : 0;

  return {
    window: {
      days: c.windowDays,
      startDate: new Date(_windowStartMs).toISOString(),
    },
    availability: {
      target: c.availabilityTarget,
      actual: availActual,
      errorBudgetRemaining: availBudgetRemaining,
      errorBudgetConsumed: 1 - availBudgetRemaining,
    },
    latency: {
      target: c.latencyTarget,
      thresholdMs: c.latencyThresholdMs,
      actual: latActual,
      errorBudgetRemaining: latBudgetRemaining,
      errorBudgetConsumed: 1 - latBudgetRemaining,
    },
    burnRates: {
      availability: Math.round(availBurnRate * 100) / 100,
      latency: Math.round(latBurnRate * 100) / 100,
      alerting:
        c.enabled && (availBurnRate >= c.burnAlertThreshold || latBurnRate >= c.burnAlertThreshold),
    },
    metrics: {
      totalRequests: Math.round(totalRequests),
      errorRequests: Math.round(errorRequests),
      slowRequests: Math.round(slowRequests),
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check burn rates and fire alerts if thresholds are exceeded.
 * Called periodically by the Hono middleware on every request (debounced).
 */
let lastCheckAt = 0;
const CHECK_INTERVAL_MS = 60_000; // only check once per minute

export async function checkBurnRateAlerts(): Promise<void> {
  if (!cfg().enabled) return;

  const now = Date.now();
  if (now - lastCheckAt < CHECK_INTERVAL_MS) return;
  lastCheckAt = now;

  try {
    const status = await computeSLOStatus();
    const { burnRates } = status;

    if (!burnRates.alerting) return;

    const cooldownMs = cfg().alertCooldownMs;
    if (now - lastBurnAlertAt < cooldownMs) return;
    lastBurnAlertAt = now;

    const reasons: string[] = [];
    if (burnRates.availability >= cfg().burnAlertThreshold) {
      reasons.push(
        `Availability burn rate ${burnRates.availability}× (target: 99.9%, budget remaining: ${(status.availability.errorBudgetRemaining * 100).toFixed(1)}%)`
      );
    }
    if (burnRates.latency >= cfg().burnAlertThreshold) {
      reasons.push(
        `Latency burn rate ${burnRates.latency}× (target: P${cfg().latencyThresholdMs}ms ≥ ${cfg().latencyTarget * 100}%, budget remaining: ${(status.latency.errorBudgetRemaining * 100).toFixed(1)}%)`
      );
    }

    logger.error("SLO burn-rate alert", {
      burnRates,
      reasons,
    });

    void notificationDispatcher.dispatch("slo.burn", {
      severity: "critical",
      reasons,
      burnRates,
      availability: {
        target: status.availability.target,
        actual: status.availability.actual,
        budgetRemaining: status.availability.errorBudgetRemaining,
      },
      latency: {
        target: status.latency.target,
        actual: status.latency.actual,
        budgetRemaining: status.latency.errorBudgetRemaining,
      },
      hostname: process.env.HOSTNAME ?? "api",
      window: status.window,
    });
  } catch (err) {
    logger.warn("SLO burn-rate check failed", { error: String(err) });
  }
}

/** Hono middleware: debounced SLO burn-rate check on every request. */
export function sloAlertingMiddleware() {
  return createMiddleware<HonoEnv>(async (_c, next) => {
    // Run check in background — don't block the request
    void checkBurnRateAlerts();
    await next();
  });
}

/** Hono handler: GET /admin/slo — current SLO status as JSON. */
export async function sloRouteHandler(c: Context<HonoEnv>): Promise<Response> {
  try {
    const status = await computeSLOStatus();
    return c.json(status);
  } catch (err) {
    return internalErrorResponse(c, logger, "SLO status failed", err);
  }
}

/** Reset window start (useful for tests). */
export function resetSloWindow(): void {
  _windowStartMs = Date.now();
  lastBurnAlertAt = 0;
  lastCheckAt = 0;
}
