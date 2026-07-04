"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportTicketMessagesTable = exports.supportTicketsTable = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const identity_1 = require("./identity");
const organizations_1 = require("./organizations");
exports.supportTicketsTable = (0, pg_core_1.pgTable)("support_tickets", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => identity_1.usersTable.id, { onDelete: "cascade" }),
    orgId: (0, pg_core_1.uuid)("org_id").references(() => organizations_1.organizationsTable.id, {
        onDelete: "set null",
    }),
    subject: (0, pg_core_1.text)("subject").notNull(),
    status: (0, pg_core_1.text)("status").notNull().default("open"), // open | pending | closed
    priority: (0, pg_core_1.text)("priority").notNull().default("normal"), // low | normal | high
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
});
exports.supportTicketMessagesTable = (0, pg_core_1.pgTable)("support_ticket_messages", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    ticketId: (0, pg_core_1.uuid)("ticket_id")
        .notNull()
        .references(() => exports.supportTicketsTable.id, { onDelete: "cascade" }),
    authorId: (0, pg_core_1.uuid)("author_id").references(() => identity_1.usersTable.id, {
        onDelete: "set null",
    }),
    authorRole: (0, pg_core_1.text)("author_role").notNull(), // user | agent
    body: (0, pg_core_1.text)("body").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
//# sourceMappingURL=support.js.map