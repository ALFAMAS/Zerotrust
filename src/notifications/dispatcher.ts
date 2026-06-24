import crypto from "node:crypto";
import { getLogger } from "../logger";
import {
  formatPagerDutyPayload,
  formatSlackMessage,
  formatTeamsMessage,
} from "./formatters";
import type {
  NotificationChannel,
  NotificationEvent,
  PagerDutyConfig,
  SlackConfig,
  TeamsConfig,
} from "./types";

export class NotificationDispatcher {
  private channels: Map<string, NotificationChannel> = new Map();

  addChannel(
    channel: Omit<NotificationChannel, "id"> & { id?: string },
  ): NotificationChannel {
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
    return tenantId
      ? all.filter((c) => !c.tenantId || c.tenantId === tenantId)
      : all;
  }

  async dispatch(
    event: NotificationEvent,
    data: Record<string, unknown>,
    tenantId?: string,
  ): Promise<void> {
    const matching = this.getChannels(tenantId).filter(
      (c) => c.enabled && c.events.includes(event),
    );
    if (matching.length === 0) return;

    await Promise.allSettled(
      matching.map((channel) => this.sendToChannel(channel, event, data)),
    );
  }

  private async sendToChannel(
    channel: NotificationChannel,
    event: NotificationEvent,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (channel.type === "slack") {
        await this.sendToSlack(
          channel.config as SlackConfig,
          formatSlackMessage(event, data),
        );
      } else if (channel.type === "teams") {
        await this.sendToTeams(
          channel.config as TeamsConfig,
          formatTeamsMessage(event, data),
        );
      } else if (channel.type === "pagerduty") {
        const cfg = channel.config as PagerDutyConfig;
        await this.sendToPagerDuty(
          cfg,
          formatPagerDutyPayload(event, data, cfg.integrationKey, cfg.severity),
        );
      }
    } catch (err) {
      getLogger().warn("Notification delivery failed", {
        channel: channel.id,
        event,
        error: (err as Error).message,
      });
    }
  }

  private async sendToSlack(
    config: SlackConfig,
    payload: object,
  ): Promise<void> {
    const body = {
      ...payload,
      channel: config.channel,
      username: config.username,
      icon_emoji: config.iconEmoji,
    };
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Slack webhook returned ${res.status}`);
  }

  private async sendToTeams(
    config: TeamsConfig,
    payload: object,
  ): Promise<void> {
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Teams webhook returned ${res.status}`);
  }

  private async sendToPagerDuty(
    _config: PagerDutyConfig,
    payload: object,
  ): Promise<void> {
    const res = await fetch("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`PagerDuty API returned ${res.status}`);
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
        ([
          "anomaly.detected",
          "auth.brute_force",
          "user.locked",
        ] as NotificationEvent[]),
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
