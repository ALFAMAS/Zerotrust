CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text,
  "url" text NOT NULL,
  "secret" text NOT NULL,
  "events" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "retry_policy" jsonb DEFAULT '{"maxRetries":3,"backoffMs":1000}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "webhook_endpoints_tenant_idx" ON "webhook_endpoints" ("tenant_id");
CREATE INDEX IF NOT EXISTS "webhook_endpoints_active_idx" ON "webhook_endpoints" ("active");
CREATE INDEX IF NOT EXISTS "webhook_endpoints_created_idx" ON "webhook_endpoints" ("created_at");
