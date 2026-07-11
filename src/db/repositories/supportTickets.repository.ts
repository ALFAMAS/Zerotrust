import { and, desc, eq } from "drizzle-orm";
import { getDb } from "..";
import { setOrgRlsContext } from "../rls";
import { supportTicketMessagesTable, supportTicketsTable } from "../schema";
import { createOrgScopedContext } from "./orgScopedFactory";

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
 * Org-scoped support ticket repository. Every query includes an org predicate.
 */
export function supportTicketsRepo(orgId: string) {
  const { orgId: scopedOrgId } = createOrgScopedContext(orgId);

  return {
    orgId: scopedOrgId,

    async createWithMessage(input: Omit<CreateSupportTicketInput, "orgId"> & { userId: string }) {
      const db = getDb();
      return db.transaction(async (tx) => {
        await setOrgRlsContext(tx, { orgId: scopedOrgId, userId: input.userId });
        const [ticket] = await tx
          .insert(supportTicketsTable)
          .values({
            userId: input.userId,
            orgId: scopedOrgId,
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
    },

    async listForUser(userId: string) {
      const db = getDb();
      return db.transaction(async (tx) => {
        await setOrgRlsContext(tx, { orgId: scopedOrgId, userId });
        return tx
          .select()
          .from(supportTicketsTable)
          .where(
            and(eq(supportTicketsTable.orgId, scopedOrgId), eq(supportTicketsTable.userId, userId))
          )
          .orderBy(desc(supportTicketsTable.updatedAt));
      });
    },

    async getById(ticketId: string, userId: string) {
      const db = getDb();
      return db.transaction(async (tx) => {
        await setOrgRlsContext(tx, { orgId: scopedOrgId, userId });
        const [ticket] = await tx
          .select()
          .from(supportTicketsTable)
          .where(
            and(eq(supportTicketsTable.id, ticketId), eq(supportTicketsTable.orgId, scopedOrgId))
          )
          .limit(1);
        return ticket ?? null;
      });
    },
  };
}

export type SupportTicketsRepo = ReturnType<typeof supportTicketsRepo>;

/**
 * Open a support ticket and persist its first message atomically.
 * When `orgId` is provided, uses org-scoped RLS context.
 */
export async function createSupportTicketWithMessage(input: CreateSupportTicketInput) {
  if (input.orgId) {
    return supportTicketsRepo(input.orgId).createWithMessage(input);
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(supportTicketsTable)
      .values({
        userId: input.userId,
        orgId: null,
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
