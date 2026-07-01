import { fetchPublicUrl } from "../../shared/safeFetch";
import { formatTeamsMessage } from "../formatters";
import type { NotificationAdapter, TeamsConfig } from "../types";

export const teamsAdapter: NotificationAdapter = {
  type: "teams",
  async send(rawConfig, event, data) {
    const config = rawConfig as TeamsConfig;
    // SECURITY (CWE-918): Teams webhooks can be configured via the admin API,
    // so the host is user-influenced.
    const res = await fetchPublicUrl(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formatTeamsMessage(event, data)),
    });
    if (!res.ok) throw new Error(`Teams webhook returned ${res.status}`);
  },
};
