import { and, eq } from "drizzle-orm";
import type { WebhookEndpoint, WebhookEventType } from "../../modules/webhooks/types";
import { withOrgRls, withOrgRlsRead } from "../rls";
import { webhookEndpointsTable } from "../schema";
import { createOrgScopedRepository } from "./orgScopedFactory";

type RetryPolicy = { maxRetries: number; backoffMs: number };

type WebhookEndpointRow = typeof webhookEndpointsTable.$inferSelect;

function normalizeEvents(value: unknown): WebhookEventType[] {
  return Array.isArray(value)
    ? (value.filter((event) => typeof event === "string") as WebhookEventType[])
    : [];
}

function fromRow(row: WebhookEndpointRow): WebhookEndpoint {
  return {
    id: row.id,
    url: row.url,
    secret: row.secret,
    events: normalizeEvents(row.events),
    orgId: row.orgId ?? undefined,
    active: row.active,
    createdAt: row.createdAt,
    retryPolicy: (row.retryPolicy as RetryPolicy) ?? { maxRetries: 3, backoffMs: 1000 },
  };
}

/**
 * SEC-12 exemplar: org-scoped webhook repository. `orgId` is required at
 * construction — every query includes an org predicate.
 */
export function webhooksRepo(orgId: string) {
  return createOrgScopedRepository(orgId, ({ orgId: scopedOrgId }) => ({
    orgId: scopedOrgId,

    async listEndpoints(userId?: string): Promise<WebhookEndpoint[]> {
      return withOrgRlsRead({ orgId: scopedOrgId, userId }, async (db) => {
        const rows = await db
          .select()
          .from(webhookEndpointsTable)
          .where(eq(webhookEndpointsTable.orgId, scopedOrgId))
          .orderBy(webhookEndpointsTable.createdAt);
        return rows.map(fromRow);
      });
    },

    async getEndpoint(id: string, userId?: string): Promise<WebhookEndpoint | null> {
      return withOrgRlsRead({ orgId: scopedOrgId, userId }, async (db) => {
        const [row] = await db
          .select()
          .from(webhookEndpointsTable)
          .where(
            and(eq(webhookEndpointsTable.id, id), eq(webhookEndpointsTable.orgId, scopedOrgId))
          )
          .limit(1);
        return row ? fromRow(row) : null;
      });
    },

    async deleteEndpoint(id: string, userId?: string): Promise<boolean> {
      return withOrgRls({ orgId: scopedOrgId, userId }, async (db) => {
        const [row] = await db
          .delete(webhookEndpointsTable)
          .where(
            and(eq(webhookEndpointsTable.id, id), eq(webhookEndpointsTable.orgId, scopedOrgId))
          )
          .returning({ id: webhookEndpointsTable.id });
        return Boolean(row);
      });
    },
  }));
}

/** Type helper for handlers that accept a scoped repo instance. */
export type WebhooksRepo = ReturnType<typeof webhooksRepo>;
