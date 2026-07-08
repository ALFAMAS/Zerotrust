/** DI-1 — support domain tables. */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./identity";
import { organizationsTable } from "./organizations";

export const supportTicketsTable = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").references(() => organizationsTable.id, {
    onDelete: "set null",
  }),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("open"), // open | pending | closed
  priority: text("priority").notNull().default("normal"), // low | normal | high
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const supportTicketMessagesTable = pgTable("support_ticket_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  authorRole: text("author_role").notNull(), // user | agent
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
