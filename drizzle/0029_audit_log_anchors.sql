CREATE TABLE IF NOT EXISTS "audit_log_anchors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "anchored_at" timestamp with time zone NOT NULL,
  "environment" text NOT NULL,
  "latest_seq" bigint NOT NULL,
  "latest_entry_hash" text NOT NULL,
  "previous_anchor_hash" text,
  "anchor_hash" text NOT NULL,
  "external_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "audit_log_anchors_anchored_at_idx" ON "audit_log_anchors" ("anchored_at");
CREATE INDEX IF NOT EXISTS "audit_log_anchors_latest_seq_idx" ON "audit_log_anchors" ("latest_seq");
