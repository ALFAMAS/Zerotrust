-- Tier 5 #24: RLS on remaining org-scoped tables (org_feature_flags, org_scim_tokens).

-- 0024_drop_enterprise_federation dropped org_scim_tokens, but the SCIM 2.0
-- feature (Tier 4 #16) revived the table in the code schema without a
-- re-creation migration — fresh `db:migrate` databases therefore lack it.
-- Re-create it (matching src/db/schema/organizations.ts) before enabling RLS.
CREATE TABLE IF NOT EXISTS "org_scim_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "org_scim_tokens_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_scim_tokens_org_id_idx" ON "org_scim_tokens" USING btree ("org_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_scim_tokens" ADD CONSTRAINT "org_scim_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_scim_tokens" ADD CONSTRAINT "org_scim_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

ALTER TABLE "org_feature_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_feature_flags" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_feature_flags_org_rls" ON "org_feature_flags";--> statement-breakpoint
CREATE POLICY "org_feature_flags_org_rls" ON "org_feature_flags"
  FOR ALL
  USING (public.app_rls_org_allowed("org_id"))
  WITH CHECK (public.app_rls_org_allowed("org_id"));--> statement-breakpoint

ALTER TABLE "org_scim_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_scim_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_scim_tokens_org_rls" ON "org_scim_tokens";--> statement-breakpoint
CREATE POLICY "org_scim_tokens_org_rls" ON "org_scim_tokens"
  FOR ALL
  USING (public.app_rls_org_allowed("org_id"))
  WITH CHECK (public.app_rls_org_allowed("org_id"));
