CREATE TABLE IF NOT EXISTS "oauth_exchange_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_exchange_codes" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_exchange_codes" ADD COLUMN IF NOT EXISTS "code" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_exchange_codes" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_exchange_codes" ADD COLUMN IF NOT EXISTS "session_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_exchange_codes" ADD COLUMN IF NOT EXISTS "access_token" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_exchange_codes" ADD COLUMN IF NOT EXISTS "refresh_token" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_exchange_codes" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_exchange_codes" ADD COLUMN IF NOT EXISTS "used_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "oauth_exchange_codes" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_exchange_codes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "oauth_exchange_codes" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_exchange_codes_code_unique" ON "oauth_exchange_codes" ("code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_exchange_codes_expires_at_idx" ON "oauth_exchange_codes" ("expires_at");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_exchange_codes" ADD CONSTRAINT "oauth_exchange_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_exchange_codes" ADD CONSTRAINT "oauth_exchange_codes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
