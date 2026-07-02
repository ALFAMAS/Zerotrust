import { desc, eq } from "drizzle-orm";
import { getDb, getReadDb } from "../../db/index";
import { webhookDeliveryLogsTable } from "../../db/schema";
import { countRows } from "../../shared/dbCount";

export interface DeliveryLogEntry {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  attempt: number;
  duration: number | null;
  success: boolean;
  createdAt: Date;
}

export async function logDelivery(input: {
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
  attempt?: number;
  duration?: number;
  success: boolean;
}): Promise<DeliveryLogEntry> {
  const db = getDb();
  const [entry] = await db
    .insert(webhookDeliveryLogsTable)
    .values({
      webhookId: input.webhookId,
      event: input.event,
      payload: input.payload,
      statusCode: input.statusCode ?? null,
      responseBody: input.responseBody ?? null,
      errorMessage: input.errorMessage ?? null,
      attempt: input.attempt ?? 1,
      duration: input.duration ?? null,
      success: input.success,
    })
    .returning();
  return entry as DeliveryLogEntry;
}

export async function getDeliveryLogs(
  webhookId: string,
  limit = 50,
  offset = 0
): Promise<DeliveryLogEntry[]> {
  const db = getReadDb();
  const rows = await db
    .select()
    .from(webhookDeliveryLogsTable)
    .where(eq(webhookDeliveryLogsTable.webhookId, webhookId))
    .orderBy(desc(webhookDeliveryLogsTable.createdAt))
    .offset(offset)
    .limit(limit);
  return rows as DeliveryLogEntry[];
}

export async function countDeliveryLogs(webhookId: string): Promise<number> {
  return countRows(
    getReadDb(),
    webhookDeliveryLogsTable,
    eq(webhookDeliveryLogsTable.webhookId, webhookId)
  );
}

export async function getDeliveryLogById(logId: string): Promise<DeliveryLogEntry | null> {
  const db = getReadDb();
  const [row] = await db
    .select()
    .from(webhookDeliveryLogsTable)
    .where(eq(webhookDeliveryLogsTable.id, logId))
    .limit(1);
  return (row as DeliveryLogEntry) ?? null;
}
