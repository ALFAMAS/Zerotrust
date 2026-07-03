-- MT-3: webhook isolation uses org_id only (ZT-1 backfill complete).
DROP INDEX IF EXISTS "webhook_endpoints_tenant_idx";
ALTER TABLE "webhook_endpoints" DROP COLUMN IF EXISTS "tenant_id";
