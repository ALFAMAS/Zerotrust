import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { withOrgRls } from "../db/rls";
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
    ...(row.orgId ? { orgId: row.orgId } : {}),
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
    orgId: endpoint.orgId ?? null,
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
  if (partial.orgId !== undefined) values.orgId = partial.orgId ?? null;
  if (partial.active !== undefined) values.active = partial.active;
  if (partial.headers !== undefined) values.headers = partial.headers ?? {};
  if (partial.retryPolicy !== undefined) values.retryPolicy = partial.retryPolicy;
  values.updatedAt = new Date();
  return values;
}

function orgScopeWhere(orgIds: string[]) {
  return inArray(webhookEndpointsTable.orgId, orgIds);
}

type DbLike = ReturnType<typeof getDb>;

/** Apply transaction-local RLS when a single org is in scope. */
async function withOptionalOrgRls<T>(
  orgIds: string[] | undefined,
  userId: string | undefined,
  fn: (db: DbLike) => Promise<T>
): Promise<T> {
  if (orgIds?.length === 1) {
    return withOrgRls({ orgId: orgIds[0], userId }, fn);
  }
  return fn(getDb());
}

export class WebhookStore {
  async registerEndpoint(
    endpoint: WebhookEndpointInput,
    userId?: string
  ): Promise<WebhookEndpoint> {
    const run = async (db: DbLike) => {
      const [record] = await db
        .insert(webhookEndpointsTable)
        .values(valuesForInsert(endpoint))
        .returning();
      return fromRow(record);
    };
    if (endpoint.orgId) {
      return withOrgRls({ orgId: endpoint.orgId, userId }, run);
    }
    return run(getDb());
  }

  async updateEndpoint(
    id: string,
    partial: Partial<WebhookEndpointInput>,
    orgIds?: string[],
    userId?: string
  ): Promise<WebhookEndpoint | null> {
    return withOptionalOrgRls(orgIds, userId, async (db) => {
      const where =
        orgIds && orgIds.length > 0
          ? and(eq(webhookEndpointsTable.id, id), orgScopeWhere(orgIds))
          : eq(webhookEndpointsTable.id, id);
      const [record] = await db
        .update(webhookEndpointsTable)
        .set(valuesForUpdate(partial))
        .where(where)
        .returning();
      return record ? fromRow(record) : null;
    });
  }

  async deleteEndpoint(id: string, orgIds?: string[], userId?: string): Promise<boolean> {
    return withOptionalOrgRls(orgIds, userId, async (db) => {
      const where =
        orgIds && orgIds.length > 0
          ? and(eq(webhookEndpointsTable.id, id), orgScopeWhere(orgIds))
          : eq(webhookEndpointsTable.id, id);
      const [record] = await db.delete(webhookEndpointsTable).where(where).returning({
        id: webhookEndpointsTable.id,
      });
      return Boolean(record);
    });
  }

  async getEndpoint(
    id: string,
    orgIds?: string[],
    userId?: string
  ): Promise<WebhookEndpoint | null> {
    return withOptionalOrgRls(orgIds, userId, async (db) => {
      const where =
        orgIds && orgIds.length > 0
          ? and(eq(webhookEndpointsTable.id, id), orgScopeWhere(orgIds))
          : eq(webhookEndpointsTable.id, id);
      const rows = await db.select().from(webhookEndpointsTable).where(where).limit(1);
      return rows[0] ? fromRow(rows[0]) : null;
    });
  }

  async getEndpointsForEvent(
    event: WebhookEventType,
    orgId?: string,
    userId?: string
  ): Promise<WebhookEndpoint[]> {
    const endpoints = orgId ? await this.listEndpointsForOrgs([orgId], userId) : [];
    return endpoints.filter((ep) => ep.active && ep.events.includes(event));
  }

  async listEndpointsForOrgs(orgIds: string[], userId?: string): Promise<WebhookEndpoint[]> {
    if (orgIds.length === 0) return [];
    return withOptionalOrgRls(orgIds, userId, async (db) => {
      const rows = await db
        .select()
        .from(webhookEndpointsTable)
        .where(orgScopeWhere(orgIds))
        .orderBy(desc(webhookEndpointsTable.createdAt));
      return rows.map(fromRow);
    });
  }
}

export const webhookStore = new WebhookStore();
