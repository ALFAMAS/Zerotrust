-- Tier 5 #24: RLS on remaining org-scoped tables (org_feature_flags, org_scim_tokens).

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
