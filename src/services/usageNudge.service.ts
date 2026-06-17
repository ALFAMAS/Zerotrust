/**
 * Usage-based upsell nudges.
 *
 * When an account crosses a usage threshold for a metered resource (e.g. 80% of
 * the monthly API-call quota) we nudge them in-app (and optionally by email) to
 * upgrade. Each (metric, level, period) fires at most once per process to avoid
 * spamming on every usage check.
 */
import { getUsageSummary } from "./usage.service";
import { broadcastNotification } from "../api/routes/notification.routes";
import { sendNotificationEmail } from "./email.service";
import { getLogger } from "../logger";

const logger = getLogger("usage-nudge");

const WARN_THRESHOLD = parseFloat(process.env.USAGE_NUDGE_THRESHOLD || "0.8");

export interface UsageNudge {
  metric: string;
  used: number;
  limit: number;
  ratio: number;
  level: "warning" | "exceeded";
}

interface SummaryLike {
  period: string;
  metrics: Record<string, { used: number; limit: number }>;
}

/**
 * Pure: given a usage summary, return the nudges that should fire. Unlimited
 * metrics (limit <= 0) and unused metrics are ignored. ratio >= 1 ⇒ "exceeded",
 * ratio >= threshold ⇒ "warning".
 */
export function evaluateUsageNudges(
  summary: SummaryLike,
  threshold = WARN_THRESHOLD
): UsageNudge[] {
  const nudges: UsageNudge[] = [];
  for (const [metric, { used, limit }] of Object.entries(summary.metrics)) {
    if (!limit || limit <= 0) continue; // unlimited / unmetered
    if (used <= 0) continue;
    const ratio = used / limit;
    if (ratio >= 1) {
      nudges.push({ metric, used, limit, ratio, level: "exceeded" });
    } else if (ratio >= threshold) {
      nudges.push({ metric, used, limit, ratio, level: "warning" });
    }
  }
  return nudges;
}

// Dedup: one nudge per (recipient, metric, level, billing period).
const sent = new Set<string>();
// Throttle: avoid recomputing the (multi-query) usage summary on every request.
const lastChecked = new Map<string, number>();
const MIN_CHECK_INTERVAL_MS = parseInt(process.env.USAGE_NUDGE_MIN_INTERVAL_MS || String(5 * 60 * 1000));

export function _resetUsageNudgeDedup(): void {
  sent.clear();
  lastChecked.clear();
}

const METRIC_LABELS: Record<string, string> = {
  api_calls: "API calls",
  seats: "seats",
  storage_bytes: "storage",
};

/**
 * Evaluate the scope's usage and dispatch any new nudges to `recipientUserId`
 * (in-app always; email when `email` is provided). Returns the nudges fired.
 */
export async function runUsageNudges(
  scope: { userId?: string; orgId?: string },
  recipientUserId: string,
  opts: { email?: string; displayName?: string } = {}
): Promise<UsageNudge[]> {
  // Cheap throttle so hot paths (every metered API call) don't recompute usage.
  const now = Date.now();
  const last = lastChecked.get(recipientUserId) ?? 0;
  if (now - last < MIN_CHECK_INTERVAL_MS) return [];
  lastChecked.set(recipientUserId, now);

  const summary = (await getUsageSummary(scope)) as SummaryLike;
  const due = evaluateUsageNudges(summary);
  const fired: UsageNudge[] = [];

  for (const n of due) {
    const key = `${recipientUserId}:${n.metric}:${n.level}:${summary.period}`;
    if (sent.has(key)) continue;
    sent.add(key);
    fired.push(n);

    const label = METRIC_LABELS[n.metric] ?? n.metric;
    const pct = Math.round(n.ratio * 100);
    const title =
      n.level === "exceeded"
        ? `You've reached your ${label} limit`
        : `You've used ${pct}% of your ${label} quota`;
    const message =
      n.level === "exceeded"
        ? `Your plan's ${label} limit (${n.limit}) has been reached. Upgrade to avoid interruptions.`
        : `You're at ${pct}% of your ${label} quota (${n.used}/${n.limit}). Consider upgrading.`;

    broadcastNotification(recipientUserId, {
      type: "usage_nudge",
      level: n.level,
      metric: n.metric,
      title,
      message,
      ctaUrl: "/dashboard/billing",
    });

    if (opts.email) {
      void sendNotificationEmail(opts.email, {
        name: opts.displayName ?? opts.email,
        title,
        body: message,
        link: `${process.env.APP_URL ?? "http://localhost:3000"}/dashboard/billing`,
      });
    }
  }

  if (fired.length > 0) {
    logger.info("Usage nudges dispatched", {
      recipientUserId,
      metrics: fired.map((f) => `${f.metric}:${f.level}`),
    });
  }
  return fired;
}
