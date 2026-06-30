CREATE TABLE "processed_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consumer" text NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_webhook_events_consumer_key_unq" UNIQUE("consumer","event_key")
);
--> statement-breakpoint
CREATE INDEX "processed_webhook_events_processed_idx" ON "processed_webhook_events" USING btree ("processed_at");
