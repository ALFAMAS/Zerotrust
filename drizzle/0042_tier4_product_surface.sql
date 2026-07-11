CREATE TABLE IF NOT EXISTS "org_feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_percent" integer DEFAULT 100 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_feature_flags_org_id_key_unique" UNIQUE("org_id","key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_feature_flags_org_id_idx" ON "org_feature_flags" USING btree ("org_id");
--> statement-breakpoint
ALTER TABLE "org_feature_flags" ADD CONSTRAINT "org_feature_flags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
