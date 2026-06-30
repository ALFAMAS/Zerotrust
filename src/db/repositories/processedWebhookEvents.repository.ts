import { and, eq } from "drizzle-orm";
import { getDb } from "..";
import { processedWebhookEventsTable } from "../schema";

export interface ProcessedWebhookEventClaim {
  consumer: string;
  eventKey: string;
  eventType: string;
}

export interface ProcessedWebhookEventKey {
  consumer: string;
  eventKey: string;
}

/**
 * Atomically claim a provider/webhook event for one consumer.
 *
 * `consumer` namespaces event keys so unrelated integrations can safely receive
 * the same provider id or content hash without colliding.
 */
export async function claimProcessedWebhookEvent(
  claim: ProcessedWebhookEventClaim
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .insert(processedWebhookEventsTable)
    .values(claim)
    .onConflictDoNothing()
    .returning({
      consumer: processedWebhookEventsTable.consumer,
      eventKey: processedWebhookEventsTable.eventKey,
    });
  return rows.length > 0;
}

/**
 * Release a claim when processing fails after the claim was recorded.
 *
 * This lets the provider's retry reprocess the event instead of permanently
 * dropping a mutation behind a stale processed-event row.
 */
export async function releaseProcessedWebhookEvent(key: ProcessedWebhookEventKey): Promise<void> {
  const db = getDb();
  await db
    .delete(processedWebhookEventsTable)
    .where(
      and(
        eq(processedWebhookEventsTable.consumer, key.consumer),
        eq(processedWebhookEventsTable.eventKey, key.eventKey)
      )
    );
}
