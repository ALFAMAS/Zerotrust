-- MIG-2: close the drift between the migration chain and the Drizzle code
-- schema (db:push truth). Verified by diffing pg_dump of a fresh
-- `db:migrate` database against a fresh `db:push` database.
--
-- Columns that shipped in code without a migration:
ALTER TABLE "saas_settings" ADD COLUMN IF NOT EXISTS "apple_oauth_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_security_policies" ADD COLUMN IF NOT EXISTS "require_trusted_devices" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- 0039 backfilled family_id and set NOT NULL but skipped the default the
-- schema declares:
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
-- 0033 added the JIT org columns nullable; the schema declares NOT NULL.
-- Guarded: if legacy rows still hold NULL org ids (backfill in 0033 only
-- covered UUID-shaped tenant ids), keep them nullable rather than fail the
-- deploy — the app treats NULL as unmatchable.
DO $$ BEGIN
 ALTER TABLE "cross_tenant_jit_requests" ALTER COLUMN "requestor_org_id" SET NOT NULL;
 ALTER TABLE "cross_tenant_jit_requests" ALTER COLUMN "target_org_id" SET NOT NULL;
EXCEPTION WHEN not_null_violation THEN NULL; END $$;--> statement-breakpoint
-- Dropped-feature leftovers: these exist only in migrate-provisioned DBs
-- (created by the 0017 sync snapshot); the code schema and push-provisioned
-- DBs have neither the tables nor the column.
DROP TABLE IF EXISTS "achievements" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "redemptions_catalog" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "streaks" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "user_tiers" CASCADE;--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "tenant_id";
