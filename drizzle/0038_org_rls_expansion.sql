-- SEC-4: Extend Postgres RLS to remaining org-scoped tables (defense-in-depth).

CREATE OR REPLACE FUNCTION public.app_rls_jit_request_allowed(requestor_org_id uuid, target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN coalesce(nullif(current_setting('app.rls_bypass', true), ''), '') = 'on' THEN true
    WHEN coalesce(nullif(current_setting('app.org_id', true), ''), '') = '' THEN true
    ELSE (
      requestor_org_id::text = current_setting('app.org_id', true)
      OR target_org_id::text = current_setting('app.org_id', true)
    )
  END;
$$;--> statement-breakpoint

ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "organization_members_org_rls" ON "organization_members";--> statement-breakpoint
CREATE POLICY "organization_members_org_rls" ON "organization_members"
  FOR ALL
  USING (public.app_rls_org_allowed("org_id"))
  WITH CHECK (public.app_rls_org_allowed("org_id"));--> statement-breakpoint

ALTER TABLE "organization_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_invites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "organization_invites_org_rls" ON "organization_invites";--> statement-breakpoint
CREATE POLICY "organization_invites_org_rls" ON "organization_invites"
  FOR ALL
  USING (public.app_rls_org_allowed("org_id"))
  WITH CHECK (public.app_rls_org_allowed("org_id"));--> statement-breakpoint

ALTER TABLE "org_security_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_security_policies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_security_policies_org_rls" ON "org_security_policies";--> statement-breakpoint
CREATE POLICY "org_security_policies_org_rls" ON "org_security_policies"
  FOR ALL
  USING (public.app_rls_org_allowed("org_id"))
  WITH CHECK (public.app_rls_org_allowed("org_id"));--> statement-breakpoint

ALTER TABLE "org_custom_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_custom_roles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "org_custom_roles_org_rls" ON "org_custom_roles";--> statement-breakpoint
CREATE POLICY "org_custom_roles_org_rls" ON "org_custom_roles"
  FOR ALL
  USING (public.app_rls_org_allowed("org_id"))
  WITH CHECK (public.app_rls_org_allowed("org_id"));--> statement-breakpoint

ALTER TABLE "trusted_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trusted_devices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "trusted_devices_org_rls" ON "trusted_devices";--> statement-breakpoint
CREATE POLICY "trusted_devices_org_rls" ON "trusted_devices"
  FOR ALL
  USING (public.app_rls_org_allowed("org_id"))
  WITH CHECK (public.app_rls_org_allowed("org_id"));--> statement-breakpoint

ALTER TABLE "tax_exemptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tax_exemptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tax_exemptions_org_rls" ON "tax_exemptions";--> statement-breakpoint
CREATE POLICY "tax_exemptions_org_rls" ON "tax_exemptions"
  FOR ALL
  USING (public.app_rls_org_allowed("org_id"))
  WITH CHECK (public.app_rls_org_allowed("org_id"));--> statement-breakpoint

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "api_keys_org_rls" ON "api_keys";--> statement-breakpoint
CREATE POLICY "api_keys_org_rls" ON "api_keys"
  FOR ALL
  USING (
    public.app_rls_org_allowed("org_id")
    OR (
      "org_id" IS NULL
      AND coalesce(nullif(current_setting('app.org_id', true), ''), '') = ''
    )
  )
  WITH CHECK (
    public.app_rls_org_allowed("org_id")
    OR (
      "org_id" IS NULL
      AND coalesce(nullif(current_setting('app.org_id', true), ''), '') = ''
    )
  );--> statement-breakpoint

ALTER TABLE "file_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "file_attachments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "file_attachments_org_rls" ON "file_attachments";--> statement-breakpoint
CREATE POLICY "file_attachments_org_rls" ON "file_attachments"
  FOR ALL
  USING (
    public.app_rls_org_allowed("org_id")
    OR (
      "org_id" IS NULL
      AND coalesce(nullif(current_setting('app.org_id', true), ''), '') = ''
    )
  )
  WITH CHECK (
    public.app_rls_org_allowed("org_id")
    OR (
      "org_id" IS NULL
      AND coalesce(nullif(current_setting('app.org_id', true), ''), '') = ''
    )
  );--> statement-breakpoint

ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "feedback_org_rls" ON "feedback";--> statement-breakpoint
CREATE POLICY "feedback_org_rls" ON "feedback"
  FOR ALL
  USING (
    public.app_rls_org_allowed("org_id")
    OR (
      "org_id" IS NULL
      AND coalesce(nullif(current_setting('app.org_id', true), ''), '') = ''
    )
  )
  WITH CHECK (
    public.app_rls_org_allowed("org_id")
    OR (
      "org_id" IS NULL
      AND coalesce(nullif(current_setting('app.org_id', true), ''), '') = ''
    )
  );--> statement-breakpoint

ALTER TABLE "cross_tenant_jit_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cross_tenant_jit_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "cross_tenant_jit_requests_org_rls" ON "cross_tenant_jit_requests";--> statement-breakpoint
CREATE POLICY "cross_tenant_jit_requests_org_rls" ON "cross_tenant_jit_requests"
  FOR ALL
  USING (public.app_rls_jit_request_allowed("requestor_org_id", "target_org_id"))
  WITH CHECK (public.app_rls_jit_request_allowed("requestor_org_id", "target_org_id"));
