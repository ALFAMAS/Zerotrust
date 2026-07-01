import { fetchFixedUrl } from "../../shared/safeFetch";
import { formatPagerDutyPayload } from "../formatters";
import type { NotificationAdapter, PagerDutyConfig } from "../types";

export const pagerDutyAdapter: NotificationAdapter = {
  type: "pagerduty",
  async send(rawConfig, event, data) {
    const config = rawConfig as PagerDutyConfig;
    const payload = formatPagerDutyPayload(event, data, config.integrationKey, config.severity);
    const res = await fetchFixedUrl("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`PagerDuty API returned ${res.status}`);
  },
};
