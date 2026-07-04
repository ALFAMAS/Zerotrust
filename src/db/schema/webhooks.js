"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processedWebhookEventsTable = exports.webhookDeliveryLogsTable = exports.webhookEndpointsTable = void 0;
/** DI-1 — webhooks domain tables. */
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const organizations_1 = require("./organizations");
exports.webhookEndpointsTable = (0, pg_core_1.pgTable)("webhook_endpoints", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    orgId: (0, pg_core_1.uuid)("org_id").references(() => organizations_1.organizationsTable.id, { onDelete: "cascade" }),
    url: (0, pg_core_1.text)("url").notNull(),
    secret: (0, pg_core_1.text)("secret").notNull(),
    events: (0, pg_core_1.jsonb)("events").notNull().default((0, drizzle_orm_1.sql) `'[]'::jsonb`),
    active: (0, pg_core_1.boolean)("active").notNull().default(true),
    headers: (0, pg_core_1.jsonb)("headers").notNull().default((0, drizzle_orm_1.sql) `'{}'::jsonb`),
    retryPolicy: (0, pg_core_1.jsonb)("retry_policy")
        .notNull()
        .default((0, drizzle_orm_1.sql) `'{"maxRetries":3,"backoffMs":1000}'::jsonb`),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    webhookEndpointsOrgIdx: (0, pg_core_1.index)("webhook_endpoints_org_idx").on(t.orgId),
    webhookEndpointsActiveIdx: (0, pg_core_1.index)("webhook_endpoints_active_idx").on(t.active),
    webhookEndpointsCreatedIdx: (0, pg_core_1.index)("webhook_endpoints_created_idx").on(t.createdAt),
}));
exports.webhookDeliveryLogsTable = (0, pg_core_1.pgTable)("webhook_delivery_logs", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    webhookId: (0, pg_core_1.uuid)("webhook_id").notNull(),
    event: (0, pg_core_1.text)("event").notNull(),
    payload: (0, pg_core_1.jsonb)("payload").notNull(),
    statusCode: (0, pg_core_1.integer)("status_code"),
    responseBody: (0, pg_core_1.text)("response_body"),
    errorMessage: (0, pg_core_1.text)("error_message"),
    attempt: (0, pg_core_1.integer)("attempt").notNull().default(1),
    duration: (0, pg_core_1.integer)("duration"),
    success: (0, pg_core_1.boolean)("success").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    webhookDeliveryLogsWebhookIdIdx: (0, pg_core_1.index)("webhook_delivery_logs_webhook_id_idx").on(t.webhookId),
    webhookDeliveryLogsCreatedIdx: (0, pg_core_1.index)("webhook_delivery_logs_created_idx").on(t.createdAt),
}));
exports.processedWebhookEventsTable = (0, pg_core_1.pgTable)("processed_webhook_events", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    consumer: (0, pg_core_1.text)("consumer").notNull(),
    eventKey: (0, pg_core_1.text)("event_key").notNull(),
    eventType: (0, pg_core_1.text)("event_type").notNull(),
    processedAt: (0, pg_core_1.timestamp)("processed_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    processedWebhookEventsConsumerKeyUnq: (0, pg_core_1.unique)("processed_webhook_events_consumer_key_unq").on(t.consumer, t.eventKey),
    processedWebhookEventsProcessedIdx: (0, pg_core_1.index)("processed_webhook_events_processed_idx").on(t.processedAt),
}));
//# sourceMappingURL=webhooks.js.map