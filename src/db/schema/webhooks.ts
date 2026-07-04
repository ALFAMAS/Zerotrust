/** DI-1 — webhooks domain tables. */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const webhookEndpointsTable = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    events: jsonb("events").notNull().default(sql`'[]'::jsonb`),
    active: boolean("active").notNull().default(true),
    headers: jsonb("headers").notNull().default(sql`'{}'::jsonb`),
    retryPolicy: jsonb("retry_policy")
      .notNull()
      .default(sql`'{"maxRetries":3,"backoffMs":1000}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    webhookEndpointsOrgIdx: index("webhook_endpoints_org_idx").on(t.orgId),
    webhookEndpointsActiveIdx: index("webhook_endpoints_active_idx").on(t.active),
    webhookEndpointsCreatedIdx: index("webhook_endpoints_created_idx").on(t.createdAt),
  })
);

export const webhookDeliveryLogsTable = pgTable(
  "webhook_delivery_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    webhookId: uuid("webhook_id").notNull(),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    statusCode: integer("status_code"),
    responseBody: text("response_body"),
    errorMessage: text("error_message"),
    attempt: integer("attempt").notNull().default(1),
    duration: integer("duration"),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    webhookDeliveryLogsWebhookIdIdx: index("webhook_delivery_logs_webhook_id_idx").on(t.webhookId),
    webhookDeliveryLogsCreatedIdx: index("webhook_delivery_logs_created_idx").on(t.createdAt),
  })
);

export const processedWebhookEventsTable = pgTable(
  "processed_webhook_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    consumer: text("consumer").notNull(),
    eventKey: text("event_key").notNull(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    processedWebhookEventsConsumerKeyUnq: unique("processed_webhook_events_consumer_key_unq").on(
      t.consumer,
      t.eventKey
    ),
    processedWebhookEventsProcessedIdx: index("processed_webhook_events_processed_idx").on(
      t.processedAt
    ),
  })
);
