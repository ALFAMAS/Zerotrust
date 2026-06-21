export {
  activeSessions,
  activeUsers,
  anomalyEventsTotal,
  authAttemptsTotal,
  authDurationSeconds,
  mfaEventsTotal,
  rateLimitHitsTotal,
  requestDurationSeconds,
  sessionEventsTotal,
  webhookDeliveriesTotal,
} from "./counters";
export { metricsMiddleware, metricsRoute } from "./middleware";
export { metricsRegistry, register } from "./registry";

// ─── Helper functions ─────────────────────────────────────────────────────────

import {
  authAttemptsTotal,
  authDurationSeconds,
  mfaEventsTotal,
  rateLimitHitsTotal,
} from "./counters";

export function recordAuth(
  action: string,
  success: boolean,
  durationMs: number,
  tenant = "default"
): void {
  authAttemptsTotal.inc({ action, success: String(success), tenant });
  authDurationSeconds.observe({ action }, durationMs / 1000);
}

export function recordMFA(method: string, event: string, tenant = "default"): void {
  mfaEventsTotal.inc({ method, event, tenant });
}

export function recordRateLimit(endpoint: string, tenant = "default"): void {
  rateLimitHitsTotal.inc({ endpoint, tenant });
}
