import type { WebhookDelivery } from "./types";

/**
 * A recorded webhook delivery attempt. Wraps the {@link WebhookDelivery} result
 * with the time it was recorded so the dashboard can show per-attempt history.
 */
export interface WebhookDeliveryLogEntry extends WebhookDelivery {
  recordedAt: Date;
}

/**
 * In-memory, bounded log of webhook delivery attempts.
 *
 * The webhook subsystem (endpoints in {@link WebhookStore}) is in-memory, so the
 * delivery log matches that lifecycle — it is a ring buffer capped per endpoint
 * so a noisy endpoint can't grow memory without bound. Full durability would
 * come with persisting the whole webhook subsystem to Postgres (a separate
 * follow-up); until then this powers the "delivery logs" UI for the live process.
 */
export class WebhookDeliveryLog {
  private byEndpoint: Map<string, WebhookDeliveryLogEntry[]> = new Map();

  constructor(private readonly maxPerEndpoint = 100) {}

  /** Record one delivery attempt (initial, retry, or ping). */
  record(delivery: WebhookDelivery): WebhookDeliveryLogEntry {
    const entry: WebhookDeliveryLogEntry = { ...delivery, recordedAt: new Date() };
    const existing = this.byEndpoint.get(delivery.endpointId) ?? [];
    // Newest first; trim to the cap.
    existing.unshift(entry);
    if (existing.length > this.maxPerEndpoint) existing.length = this.maxPerEndpoint;
    this.byEndpoint.set(delivery.endpointId, existing);
    return entry;
  }

  /** Most-recent-first delivery attempts for one endpoint. */
  list(endpointId: string, limit = 50): WebhookDeliveryLogEntry[] {
    return (this.byEndpoint.get(endpointId) ?? []).slice(0, limit);
  }

  /** Drop a deleted endpoint's history. */
  clear(endpointId: string): void {
    this.byEndpoint.delete(endpointId);
  }

  /** Test/maintenance helper: wipe all recorded deliveries. */
  reset(): void {
    this.byEndpoint.clear();
  }
}

export const webhookDeliveryLog = new WebhookDeliveryLog();
