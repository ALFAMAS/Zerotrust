import { Counter, Gauge, Histogram } from "prom-client";
import { metricsRegistry } from "./registry";

function existingMetric<T extends string, M>(name: string): M | undefined {
  return metricsRegistry.getSingleMetric<T>(name) as unknown as M | undefined;
}

export const authAttemptsTotal =
  existingMetric<"action" | "success" | "tenant", Counter<"action" | "success" | "tenant">>(
    "zerotrust_auth_attempts_total"
  ) ??
  new Counter({
    name: "zerotrust_auth_attempts_total",
    help: "Total number of authentication attempts",
    labelNames: ["action", "success", "tenant"] as const,
    registers: [metricsRegistry],
  });

export const mfaEventsTotal =
  existingMetric<"method" | "event" | "tenant", Counter<"method" | "event" | "tenant">>(
    "zerotrust_mfa_events_total"
  ) ??
  new Counter({
    name: "zerotrust_mfa_events_total",
    help: "Total number of MFA events",
    labelNames: ["method", "event", "tenant"] as const,
    registers: [metricsRegistry],
  });

export const sessionEventsTotal =
  existingMetric<"event" | "tenant", Counter<"event" | "tenant">>(
    "zerotrust_session_events_total"
  ) ??
  new Counter({
    name: "zerotrust_session_events_total",
    help: "Total number of session lifecycle events",
    labelNames: ["event", "tenant"] as const,
    registers: [metricsRegistry],
  });

export const rateLimitHitsTotal =
  existingMetric<"endpoint" | "tenant", Counter<"endpoint" | "tenant">>(
    "zerotrust_rate_limit_hits_total"
  ) ??
  new Counter({
    name: "zerotrust_rate_limit_hits_total",
    help: "Total number of rate limit hits",
    labelNames: ["endpoint", "tenant"] as const,
    registers: [metricsRegistry],
  });

export const anomalyEventsTotal =
  existingMetric<"type" | "severity" | "tenant", Counter<"type" | "severity" | "tenant">>(
    "zerotrust_anomaly_events_total"
  ) ??
  new Counter({
    name: "zerotrust_anomaly_events_total",
    help: "Total number of anomaly detection events",
    labelNames: ["type", "severity", "tenant"] as const,
    registers: [metricsRegistry],
  });

export const webhookDeliveriesTotal =
  existingMetric<"event_type" | "status", Counter<"event_type" | "status">>(
    "zerotrust_webhook_deliveries_total"
  ) ??
  new Counter({
    name: "zerotrust_webhook_deliveries_total",
    help: "Total number of webhook delivery attempts",
    labelNames: ["event_type", "status"] as const,
    registers: [metricsRegistry],
  });

export const authDurationSeconds =
  existingMetric<"action", Histogram<"action">>("zerotrust_auth_duration_seconds") ??
  new Histogram({
    name: "zerotrust_auth_duration_seconds",
    help: "Duration of authentication operations in seconds",
    labelNames: ["action"] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [metricsRegistry],
  });

export const requestDurationSeconds =
  existingMetric<"method" | "route" | "status_code", Histogram<"method" | "route" | "status_code">>(
    "zerotrust_request_duration_seconds"
  ) ??
  new Histogram({
    name: "zerotrust_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [metricsRegistry],
  });

export const activeSessions =
  existingMetric<"tenant", Gauge<"tenant">>("zerotrust_active_sessions") ??
  new Gauge({
    name: "zerotrust_active_sessions",
    help: "Number of currently active sessions",
    labelNames: ["tenant"] as const,
    registers: [metricsRegistry],
  });

export const activeUsers =
  existingMetric<"tenant", Gauge<"tenant">>("zerotrust_active_users") ??
  new Gauge({
    name: "zerotrust_active_users",
    help: "Number of currently active users",
    labelNames: ["tenant"] as const,
    registers: [metricsRegistry],
  });
