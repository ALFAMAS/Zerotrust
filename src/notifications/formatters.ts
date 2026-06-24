import type { NotificationEvent } from "./types";

const COLORS: Record<string, string> = {
  "anomaly.detected": "#ef4444",
  "auth.brute_force": "#ef4444",
  "rate_limit.triggered": "#f59e0b",
  "user.locked": "#f97316",
  "user.suspended": "#f97316",
  "mfa.failed_multiple": "#f59e0b",
  "jit.requested": "#3b82f6",
  "jit.approved": "#22c55e",
  "jit.denied": "#ef4444",
  "session.mass_revocation": "#a855f7",
  "scim.provision_error": "#f59e0b",
};

const EMOJIS: Record<string, string> = {
  "anomaly.detected": "🚨",
  "auth.brute_force": "🚨",
  "rate_limit.triggered": "⚠️",
  "user.locked": "🔒",
  "user.suspended": "🚫",
  "mfa.failed_multiple": "⚠️",
  "jit.requested": "🔑",
  "jit.approved": "✅",
  "jit.denied": "❌",
  "session.mass_revocation": "🔄",
  "scim.provision_error": "⚠️",
};

function formatTitle(event: NotificationEvent): string {
  return event.replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFields(
  data: Record<string, unknown>,
): { title: string; value: string; short: boolean }[] {
  return Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null)
    .slice(0, 6)
    .map(([k, v]) => ({
      title: k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
      value: String(v),
      short: String(v).length < 40,
    }));
}

export function formatSlackMessage(
  event: NotificationEvent,
  data: Record<string, unknown>,
): object {
  const emoji = EMOJIS[event] ?? "ℹ️";
  const color = COLORS[event] ?? "#6366f1";
  const title = formatTitle(event);
  const ts = Math.floor(Date.now() / 1000);

  return {
    attachments: [
      {
        color,
        title: `${emoji} ${title}`,
        fields: formatFields(data),
        footer: "zerotrust Security Alert",
        ts,
        mrkdwn_in: ["text", "fields"],
      },
    ],
  };
}

export function formatTeamsMessage(
  event: NotificationEvent,
  data: Record<string, unknown>,
): object {
  const emoji = EMOJIS[event] ?? "ℹ️";
  const title = formatTitle(event);
  const color = COLORS[event] ?? "#6366f1";

  const facts = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null)
    .slice(0, 6)
    .map(([k, v]) => ({ name: k, value: String(v) }));

  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: color.replace("#", ""),
    summary: `${emoji} ${title}`,
    sections: [
      {
        activityTitle: `${emoji} **${title}**`,
        activitySubtitle: new Date().toISOString(),
        facts,
        markdown: true,
      },
    ],
  };
}

export function formatPagerDutyPayload(
  event: NotificationEvent,
  data: Record<string, unknown>,
  integrationKey: string,
  severity: "critical" | "error" | "warning" | "info" = "error",
): object {
  return {
    routing_key: integrationKey,
    event_action: "trigger",
    payload: {
      summary: formatTitle(event),
      severity,
      source: "zerotrust",
      timestamp: new Date().toISOString(),
      custom_details: data,
    },
    dedup_key: `zerotrust-${event}-${Date.now()}`,
  };
}
