ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "saas_settings" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0 NOT NULL;
