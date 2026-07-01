import { fetchPublicUrl } from "../../shared/safeFetch";
import { formatSlackMessage } from "../formatters";
import type { NotificationAdapter, SlackConfig } from "../types";

export const slackAdapter: NotificationAdapter = {
  type: "slack",
  async send(rawConfig, event, data) {
    const config = rawConfig as SlackConfig;
    const body = {
      ...formatSlackMessage(event, data),
      channel: config.channel,
      username: config.username,
      icon_emoji: config.iconEmoji,
    };
    // SECURITY (CWE-918): Slack webhooks can be configured via the admin API,
    // so the host is user-influenced.
    const res = await fetchPublicUrl(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Slack webhook returned ${res.status}`);
  },
};
