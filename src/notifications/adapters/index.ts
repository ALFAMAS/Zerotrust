import type { NotificationAdapter, NotificationChannel } from "../types";
import { pagerDutyAdapter } from "./pagerduty";
import { slackAdapter } from "./slack";
import { teamsAdapter } from "./teams";

/** Built-in provider registry, keyed by channel type. Pass a different map to
 * `NotificationDispatcher`'s constructor to swap/extend providers in tests or
 * self-hosted deployments without touching dispatch logic. */
export const defaultAdapters: ReadonlyMap<NotificationChannel["type"], NotificationAdapter> =
  new Map([slackAdapter, teamsAdapter, pagerDutyAdapter].map((adapter) => [adapter.type, adapter]));

export { pagerDutyAdapter, slackAdapter, teamsAdapter };
