import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, getReadDb } from "../../db";
import {
  createSupportTicketWithMessage,
  replyToSupportTicket,
  updateSupportTicketStatus,
} from "../../db/repositories/supportTickets.repository";
import { supportTicketMessagesTable, supportTicketsTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { orgRlsMiddleware } from "../../middleware/orgRls";
import { rateLimit } from "../../middleware/rateLimiting";
import { resolvePlan } from "../../middleware/requirePlan";
import { internalError } from "../../shared/httpErrors";
import { planAllows } from "../../shared/plans";
import { hasAnyRole } from "../../shared/roles";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("support-routes");

router.use("*", authMiddleware);
router.use("*", orgRlsMiddleware({ allowQueryOrg: true }));

const TICKET_STATUSES = ["open", "pending", "closed"] as const;

const createSchema = z.object({
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  priority: z.enum(["low", "normal", "high"]).optional(),
  orgId: z.string().uuid().optional(),
});

const replySchema = z.object({ body: z.string().min(1).max(5000) });
const statusSchema = z.object({ status: z.enum(TICKET_STATUSES) });

function isAgent(user: { roles?: string[] }): boolean {
  return hasAnyRole(user, ["admin", "support"]);
}

// POST /support — open a ticket with its first message
router.post("/", rateLimit({ points: 20, windowSecs: 3600 }), async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  if (parsed.data.priority === "high") {
    const plan = await resolvePlan(user.id, parsed.data.orgId);
    if (!planAllows(plan, "prioritySupport")) {
      return c.json(
        { error: "PLAN_REQUIRED", requiredFeature: "prioritySupport", currentPlan: plan },
        403
      );
    }
  }

  try {
    const { ticket, message } = await createSupportTicketWithMessage({
      userId: user.id,
      orgId: parsed.data.orgId,
      subject: parsed.data.subject,
      priority: parsed.data.priority,
      messageBody: parsed.data.message,
    });

    logger.info("Support ticket opened", { ticketId: ticket.id, userId: user.id });
    return c.json({ ticket, messages: [message] }, 201);
  } catch (err) {
    return internalError(c, logger, "Create ticket error", err);
  }
});

// GET /support — list tickets. Owners see their own; agents can pass ?all=true.
router.get("/", async (c) => {
  const user = c.get("user");
  const all = c.req.query("all") === "true";
  try {
    const db = getReadDb();
    const showAll = all && isAgent(user);
    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(showAll ? undefined : eq(supportTicketsTable.userId, user.id))
      .orderBy(desc(supportTicketsTable.updatedAt));
    return c.json({ tickets, scope: showAll ? "all" : "mine" });
  } catch (err) {
    return internalError(c, logger, "List tickets error", err);
  }
});

// GET /support/:id — ticket with its message thread (owner or agent)
router.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  try {
    // M13: the ownership check below gates access, so this must read the
    // primary like the sibling POST /:id/messages and PATCH /:id handlers
    // already do — a replica-lag window must not let a stale ticket.userId
    // grant or deny access inconsistently with those siblings.
    const db = getDb();
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, id))
      .limit(1);
    if (!ticket) return c.json({ error: "NOT_FOUND", message: "Ticket not found" }, 404);
    if (ticket.userId !== user.id && !isAgent(user)) {
      return c.json({ error: "FORBIDDEN", message: "Not your ticket" }, 403);
    }

    const messages = await db
      .select()
      .from(supportTicketMessagesTable)
      .where(eq(supportTicketMessagesTable.ticketId, id))
      .orderBy(supportTicketMessagesTable.createdAt);

    return c.json({ ticket, messages });
  } catch (err) {
    return internalError(c, logger, "Get ticket error", err);
  }
});

// POST /support/:id/messages — reply to a ticket (owner or agent)
router.post("/:id/messages", rateLimit({ points: 60, windowSecs: 3600 }), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = replySchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  try {
    const db = getDb();
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, id))
      .limit(1);
    if (!ticket) return c.json({ error: "NOT_FOUND", message: "Ticket not found" }, 404);

    const agent = isAgent(user);
    if (ticket.userId !== user.id && !agent) {
      return c.json({ error: "FORBIDDEN", message: "Not your ticket" }, 403);
    }
    if (ticket.status === "closed") {
      return c.json({ error: "TICKET_CLOSED", message: "Reopen the ticket before replying" }, 409);
    }

    const message = await replyToSupportTicket({
      ticketId: id,
      authorId: user.id,
      authorRole: agent ? "agent" : "user",
      body: parsed.data.body,
      nextStatus: agent ? "pending" : "open",
    });

    return c.json({ message }, 201);
  } catch (err) {
    return internalError(c, logger, "Reply ticket error", err);
  }
});

// PATCH /support/:id — change status (owner may close/reopen own; agents any)
router.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);

  try {
    const db = getDb();
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, id))
      .limit(1);
    if (!ticket) return c.json({ error: "NOT_FOUND", message: "Ticket not found" }, 404);

    const agent = isAgent(user);
    if (ticket.userId !== user.id && !agent) {
      return c.json({ error: "FORBIDDEN", message: "Not your ticket" }, 403);
    }
    // Owners may only close or reopen their ticket, not mark it pending.
    if (!agent && parsed.data.status === "pending") {
      return c.json({ error: "FORBIDDEN", message: "Only agents can set pending" }, 403);
    }

    const updated = await updateSupportTicketStatus({
      ticketId: id,
      status: parsed.data.status,
    });

    return c.json({ ticket: updated });
  } catch (err) {
    return internalError(c, logger, "Update ticket status error", err);
  }
});

export default router;
