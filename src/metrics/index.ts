export { metricsRegistry, register } from "./registry";
export {
  authAttemptsTotal,
  mfaEventsTotal,
  sessionEventsTotal,
  rateLimitHitsTotal,
  anomalyEventsTotal,
  webhookDeliveriesTotal,
  authDurationSeconds,
  requestDurationSeconds,
  activeSessions,
  activeUsers,
} from "./counters";
export { metricsMiddleware, metricsRoute } from "./middleware";

// ─── Helper functions ─────────────────────────────────────────────────────────

import { authAttemptsTotal, authDurationSeconds, mfaEventsTotal, rateLimitHitsTotal } from "./counters";

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
