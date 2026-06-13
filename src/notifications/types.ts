export type NotificationEvent =
  | "anomaly.detected"
  | "rate_limit.triggered"
  | "jit.requested"
  | "jit.approved"
  | "jit.denied"
  | "user.locked"
  | "user.suspended"
  | "mfa.failed_multiple"
  | "auth.brute_force"
  | "session.mass_revocation"
  | "scim.provision_error"
  | "error.spike"
  | "latency.breach";

export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

export interface TeamsConfig {
  webhookUrl: string;
}

export interface PagerDutyConfig {
  integrationKey: string;
  severity?: "critical" | "error" | "warning" | "info";
}

export interface NotificationChannel {
  id: string;
  type: "slack" | "teams" | "pagerduty";
  name: string;
  enabled: boolean;
  tenantId?: string;
  events: NotificationEvent[];
  config: SlackConfig | TeamsConfig | PagerDutyConfig;
}
