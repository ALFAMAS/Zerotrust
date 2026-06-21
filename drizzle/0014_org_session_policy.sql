ALTER TABLE "org_security_policies" ADD COLUMN IF NOT EXISTS "max_session_age_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_security_policies" ADD COLUMN IF NOT EXISTS "idle_timeout_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_security_policies" ADD COLUMN IF NOT EXISTS "max_concurrent_sessions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_security_policies" ADD COLUMN IF NOT EXISTS "allowed_countries" text[] DEFAULT ARRAY[]::text[] NOT NULL;
