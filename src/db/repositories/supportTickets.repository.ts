import { eq } from "drizzle-orm";
import { getDb } from "..";
import { supportTicketMessagesTable, supportTicketsTable } from "../schema";

export type SupportTicketStatus = "open" | "pending" | "closed";
export type SupportMessageAuthorRole = "user" | "agent";

export interface CreateSupportTicketInput {
  userId: string;
  orgId?: string | null;
  subject: string;
  priority?: string;
  messageBody: string;
}

export interface ReplyToSupportTicketInput {
  ticketId: string;
  authorId: string;
  authorRole: SupportMessageAuthorRole;
  body: string;
  nextStatus: Exclude<SupportTicketStatus, "closed">;
}

export interface UpdateSupportTicketStatusInput {
  ticketId: string;
  status: SupportTicketStatus;
}

/**
 * Open a support ticket and persist its first message atomically.
 */
export async function createSupportTicketWithMessage(input: CreateSupportTicketInput) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(supportTicketsTable)
      .values({
        userId: input.userId,
        orgId: input.orgId ?? null,
        subject: input.subject,
        priority: input.priority ?? "normal",
        status: "open",
      })
      .returning();
    if (!ticket) throw new Error("TICKET_CREATE_FAILED");

    const [message] = await tx
      .insert(supportTicketMessagesTable)
      .values({
        ticketId: ticket.id,
        authorId: input.userId,
        authorRole: "user",
        body: input.messageBody,
      })
      .returning();
    if (!message) throw new Error("MESSAGE_CREATE_FAILED");

    return { ticket, message };
  });
}

/**
 * Append a reply and bump ticket status in one transaction.
 */
export async function replyToSupportTicket(input: ReplyToSupportTicketInput) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(supportTicketMessagesTable)
      .values({
        ticketId: input.ticketId,
        authorId: input.authorId,
        authorRole: input.authorRole,
        body: input.body,
      })
      .returning();
    if (!message) throw new Error("MESSAGE_CREATE_FAILED");

    await tx
      .update(supportTicketsTable)
      .set({ status: input.nextStatus, updatedAt: new Date() })
      .where(eq(supportTicketsTable.id, input.ticketId));

    return message;
  });
}

/** Change ticket status (close, reopen, or agent pending). */
export async function updateSupportTicketStatus(input: UpdateSupportTicketStatusInput) {
  const db = getDb();
  const [updated] = await db
    .update(supportTicketsTable)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(supportTicketsTable.id, input.ticketId))
    .returning();
  if (!updated) throw new Error("TICKET_NOT_FOUND");
  return updated;
}
