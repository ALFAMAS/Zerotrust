import crypto from "node:crypto";
import { getLogger } from "../logger";
import { defaultAdapters } from "./adapters";
import type { NotificationAdapter, NotificationChannel, NotificationEvent } from "./types";

export class NotificationDispatcher {
  private channels: Map<string, NotificationChannel> = new Map();
  private adapters: ReadonlyMap<NotificationChannel["type"], NotificationAdapter>;

  constructor(
    adapters: ReadonlyMap<NotificationChannel["type"], NotificationAdapter> = defaultAdapters
  ) {
    this.adapters = adapters;
  }

  addChannel(channel: Omit<NotificationChannel, "id"> & { id?: string }): NotificationChannel {
    const ch = {
      ...channel,
      id: channel.id ?? crypto.randomUUID(),
    } as NotificationChannel;
    this.channels.set(ch.id, ch);
    return ch;
  }

  removeChannel(id: string): void {
    this.channels.delete(id);
  }

  updateChannel(id: string, partial: Partial<NotificationChannel>): void {
    const existing = this.channels.get(id);
    if (existing) this.channels.set(id, { ...existing, ...partial });
  }

  getChannels(tenantId?: string): NotificationChannel[] {
    const all = Array.from(this.channels.values());
    return tenantId ? all.filter((c) => !c.tenantId || c.tenantId === tenantId) : all;
  }

  async dispatch(
    event: NotificationEvent,
    data: Record<string, unknown>,
    tenantId?: string
  ): Promise<void> {
    const matching = this.getChannels(tenantId).filter(
      (c) => c.enabled && c.events.includes(event)
    );
    if (matching.length === 0) return;

    await Promise.allSettled(matching.map((channel) => this.sendToChannel(channel, event, data)));
  }

  private async sendToChannel(
    channel: NotificationChannel,
    event: NotificationEvent,
    data: Record<string, unknown>
  ): Promise<void> {
    const adapter = this.adapters.get(channel.type);
    if (!adapter) return;
    try {
      await adapter.send(channel.config, event, data);
    } catch (err) {
      getLogger().warn("Notification delivery failed", {
        channel: channel.id,
        event,
        error: (err as Error).message,
      });
    }
  }
}

export const notificationDispatcher = new NotificationDispatcher();

export function initNotificationsFromEnv(): void {
  const parseEvents = (raw: string | undefined): NotificationEvent[] =>
    raw ? (raw.split(",").map((e) => e.trim()) as NotificationEvent[]) : [];

  if (process.env.SLACK_WEBHOOK_URL) {
    notificationDispatcher.addChannel({
      type: "slack",
      name: "Slack (env)",
      enabled: true,
      events:
        parseEvents(process.env.SLACK_EVENTS) ||
        (["anomaly.detected", "auth.brute_force", "user.locked"] as NotificationEvent[]),
      config: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL,
        username: process.env.SLACK_USERNAME ?? "zerotrust",
        iconEmoji: ":lock:",
      },
    });
  }

  if (process.env.TEAMS_WEBHOOK_URL) {
    notificationDispatcher.addChannel({
      type: "teams",
      name: "Teams (env)",
      enabled: true,
      events:
        parseEvents(process.env.TEAMS_EVENTS) ||
        (["anomaly.detected", "auth.brute_force"] as NotificationEvent[]),
      config: { webhookUrl: process.env.TEAMS_WEBHOOK_URL },
    });
  }

  if (process.env.PAGERDUTY_KEY) {
    notificationDispatcher.addChannel({
      type: "pagerduty",
      name: "PagerDuty (env)",
      enabled: true,
      events:
        parseEvents(process.env.PAGERDUTY_EVENTS) ||
        (["anomaly.detected", "auth.brute_force"] as NotificationEvent[]),
      config: {
        integrationKey: process.env.PAGERDUTY_KEY,
        severity: (process.env.PAGERDUTY_SEVERITY as "critical") ?? "error",
      },
    });
  }
}
