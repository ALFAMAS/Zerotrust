import { Counter, Gauge, Histogram } from "prom-client";
import { metricsRegistry } from "./registry";

// ─── Counters ────────────────────────────────────────────────────────────────

export const authAttemptsTotal = new Counter({
  name: "zeroauth_auth_attempts_total",
  help: "Total number of authentication attempts",
  labelNames: ["action", "success", "tenant"] as const,
  registers: [metricsRegistry],
});

export const mfaEventsTotal = new Counter({
  name: "zeroauth_mfa_events_total",
  help: "Total number of MFA events",
  labelNames: ["method", "event", "tenant"] as const,
  registers: [metricsRegistry],
});

export const sessionEventsTotal = new Counter({
  name: "zeroauth_session_events_total",
  help: "Total number of session lifecycle events",
  labelNames: ["event", "tenant"] as const,
  registers: [metricsRegistry],
});

export const rateLimitHitsTotal = new Counter({
  name: "zeroauth_rate_limit_hits_total",
  help: "Total number of rate limit hits",
  labelNames: ["endpoint", "tenant"] as const,
  registers: [metricsRegistry],
});

export const anomalyEventsTotal = new Counter({
  name: "zeroauth_anomaly_events_total",
  help: "Total number of anomaly detection events",
  labelNames: ["type", "severity", "tenant"] as const,
  registers: [metricsRegistry],
});

export const webhookDeliveriesTotal = new Counter({
  name: "zeroauth_webhook_deliveries_total",
  help: "Total number of webhook delivery attempts",
  labelNames: ["event_type", "status"] as const,
  registers: [metricsRegistry],
});

// ─── Histograms ──────────────────────────────────────────────────────────────

export const authDurationSeconds = new Histogram({
  name: "zeroauth_auth_duration_seconds",
  help: "Duration of authentication operations in seconds",
  labelNames: ["action"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

export const requestDurationSeconds = new Histogram({
  name: "zeroauth_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

// ─── Gauges ──────────────────────────────────────────────────────────────────

export const activeSessions = new Gauge({
  name: "zeroauth_active_sessions",
  help: "Number of currently active sessions",
  labelNames: ["tenant"] as const,
  registers: [metricsRegistry],
});

export const activeUsers = new Gauge({
  name: "zeroauth_active_users",
  help: "Number of currently active users",
  labelNames: ["tenant"] as const,
  registers: [metricsRegistry],
});
