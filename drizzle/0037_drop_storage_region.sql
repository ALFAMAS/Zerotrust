DROP INDEX IF EXISTS "organizations_storage_region_idx";--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "storage_region";
