import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { webhookEndpointsTable } from "../db/schema";
import type { WebhookEndpoint, WebhookEventType } from "./types";

type RetryPolicy = WebhookEndpoint["retryPolicy"];

type WebhookEndpointRow = typeof webhookEndpointsTable.$inferSelect;

type WebhookEndpointInput = Omit<WebhookEndpoint, "id" | "createdAt">;

function normalizeEvents(value: unknown): WebhookEventType[] {
  return Array.isArray(value)
    ? (value.filter((event) => typeof event === "string") as WebhookEventType[])
    : [];
}

function normalizeHeaders(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeRetryPolicy(value: unknown): RetryPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { maxRetries: 3, backoffMs: 1000 };
  }
  const maybe = value as Partial<RetryPolicy>;
  return {
    maxRetries: Number.isFinite(maybe.maxRetries) ? Number(maybe.maxRetries) : 3,
    backoffMs: Number.isFinite(maybe.backoffMs) ? Number(maybe.backoffMs) : 1000,
  };
}

function fromRow(row: WebhookEndpointRow): WebhookEndpoint {
  return {
    id: row.id,
    url: row.url,
    secret: row.secret,
    events: normalizeEvents(row.events),
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
    active: row.active,
    createdAt: row.createdAt,
    ...(normalizeHeaders(row.headers) ? { headers: normalizeHeaders(row.headers) } : {}),
    retryPolicy: normalizeRetryPolicy(row.retryPolicy),
  };
}

function valuesForInsert(endpoint: WebhookEndpointInput) {
  return {
    url: endpoint.url,
    secret: endpoint.secret,
    events: endpoint.events,
    tenantId: endpoint.tenantId ?? null,
    active: endpoint.active,
    headers: endpoint.headers ?? {},
    retryPolicy: endpoint.retryPolicy,
  };
}

function valuesForUpdate(partial: Partial<WebhookEndpointInput>) {
  const values: Partial<typeof webhookEndpointsTable.$inferInsert> = {};
  if (partial.url !== undefined) values.url = partial.url;
  if (partial.secret !== undefined) values.secret = partial.secret;
  if (partial.events !== undefined) values.events = partial.events;
  if (partial.tenantId !== undefined) values.tenantId = partial.tenantId ?? null;
  if (partial.active !== undefined) values.active = partial.active;
  if (partial.headers !== undefined) values.headers = partial.headers ?? {};
  if (partial.retryPolicy !== undefined) values.retryPolicy = partial.retryPolicy;
  values.updatedAt = new Date();
  return values;
}

export class WebhookStore {
  async registerEndpoint(endpoint: WebhookEndpointInput): Promise<WebhookEndpoint> {
    const db = getDb();
    const [record] = await db
      .insert(webhookEndpointsTable)
      .values(valuesForInsert(endpoint))
      .returning();
    return fromRow(record);
  }

  async updateEndpoint(
    id: string,
    partial: Partial<WebhookEndpointInput>
  ): Promise<WebhookEndpoint | null> {
    const db = getDb();
    const [record] = await db
      .update(webhookEndpointsTable)
      .set(valuesForUpdate(partial))
      .where(eq(webhookEndpointsTable.id, id))
      .returning();
    return record ? fromRow(record) : null;
  }

  async deleteEndpoint(id: string): Promise<boolean> {
    const db = getDb();
    const [record] = await db
      .delete(webhookEndpointsTable)
      .where(eq(webhookEndpointsTable.id, id))
      .returning({ id: webhookEndpointsTable.id });
    return Boolean(record);
  }

  async getEndpoint(id: string): Promise<WebhookEndpoint | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(webhookEndpointsTable)
      .where(eq(webhookEndpointsTable.id, id))
      .limit(1);
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async getEndpointsForEvent(
    event: WebhookEventType,
    tenantId?: string
  ): Promise<WebhookEndpoint[]> {
    const endpoints = await this.listEndpoints(tenantId);
    return endpoints.filter((ep) => ep.active && ep.events.includes(event));
  }

  async listEndpoints(tenantId?: string): Promise<WebhookEndpoint[]> {
    const db = getDb();
    const base = db.select().from(webhookEndpointsTable);
    const rows = tenantId
      ? await base
          .where(eq(webhookEndpointsTable.tenantId, tenantId))
          .orderBy(desc(webhookEndpointsTable.createdAt))
      : await base.orderBy(desc(webhookEndpointsTable.createdAt));
    return rows.map(fromRow);
  }
}

export const webhookStore = new WebhookStore();
