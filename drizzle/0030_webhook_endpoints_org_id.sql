ALTER TABLE "webhook_endpoints" ADD COLUMN IF NOT EXISTS "org_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "webhook_endpoints_org_idx" ON "webhook_endpoints" ("org_id");

-- Backfill org_id when legacy tenant_id holds an org UUID.
UPDATE "webhook_endpoints"
SET "org_id" = "tenant_id"::uuid
WHERE "org_id" IS NULL
  AND "tenant_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
