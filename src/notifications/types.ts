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
  | "latency.breach"
  | "slo.burn"
  | "onboarding.completed";

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

/**
 * Capability contract every notification provider implements. `config` is
 * `unknown` here because the registry is heterogeneous (see
 * `adapters/index.ts`); each adapter casts to its own concrete config type,
 * an invariant `NotificationChannel` guarantees by construction (`config`'s
 * shape always matches its `type` discriminant).
 */
export interface NotificationAdapter {
  readonly type: NotificationChannel["type"];
  send(config: unknown, event: NotificationEvent, data: Record<string, unknown>): Promise<void>;
}
