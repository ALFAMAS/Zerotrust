import { randomUUID } from "crypto";
import type { WebhookEndpoint, WebhookEventType } from "./types";

export class WebhookStore {
  private endpoints: Map<string, WebhookEndpoint> = new Map();

  registerEndpoint(
    endpoint: Omit<WebhookEndpoint, "id" | "createdAt">
  ): WebhookEndpoint {
    const id = randomUUID();
    const now = new Date();
    const record: WebhookEndpoint = {
      ...endpoint,
      id,
      createdAt: now,
    };
    this.endpoints.set(id, record);
    return record;
  }

  updateEndpoint(
    id: string,
    partial: Partial<Omit<WebhookEndpoint, "id" | "createdAt">>
  ): WebhookEndpoint | null {
    const existing = this.endpoints.get(id);
    if (!existing) return null;
    const updated: WebhookEndpoint = { ...existing, ...partial };
    this.endpoints.set(id, updated);
    return updated;
  }

  deleteEndpoint(id: string): boolean {
    return this.endpoints.delete(id);
  }

  getEndpointsForEvent(
    event: WebhookEventType,
    tenantId?: string
  ): WebhookEndpoint[] {
    return Array.from(this.endpoints.values()).filter((ep) => {
      if (!ep.active) return false;
      if (!ep.events.includes(event)) return false;
      if (tenantId !== undefined && ep.tenantId !== undefined && ep.tenantId !== tenantId) {
        return false;
      }
      return true;
    });
  }

  listEndpoints(tenantId?: string): WebhookEndpoint[] {
    const all = Array.from(this.endpoints.values());
    if (tenantId === undefined) return all;
    return all.filter((ep) => ep.tenantId === tenantId);
  }
}

export const webhookStore = new WebhookStore();
