-- MT-1 (phase 1): Postgres RLS defense-in-depth on high-value org-scoped tables.
-- Policies are permissive when app.org_id / app.rls_bypass are unset (workers,
-- admin, migrations). Set transaction-local context via setOrgRlsContext() in
-- src/db/rls.ts before org-scoped queries.

CREATE OR REPLACE FUNCTION public.app_rls_org_allowed(row_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN coalesce(nullif(current_setting('app.rls_bypass', true), ''), '') = 'on' THEN true
    WHEN coalesce(nullif(current_setting('app.org_id', true), ''), '') = '' THEN true
    WHEN row_org_id IS NULL THEN false
    ELSE row_org_id::text = current_setting('app.org_id', true)
  END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_rls_support_ticket_allowed(row_org_id uuid, row_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN coalesce(nullif(current_setting('app.rls_bypass', true), ''), '') = 'on' THEN true
    WHEN coalesce(nullif(current_setting('app.org_id', true), ''), '') = '' THEN true
    WHEN row_org_id IS NOT NULL THEN public.app_rls_org_allowed(row_org_id)
    WHEN coalesce(nullif(current_setting('app.user_id', true), ''), '') = '' THEN true
    ELSE row_user_id::text = current_setting('app.user_id', true)
  END;
$$;--> statement-breakpoint

ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "webhook_endpoints_org_rls" ON "webhook_endpoints";--> statement-breakpoint
CREATE POLICY "webhook_endpoints_org_rls" ON "webhook_endpoints"
  FOR ALL
  USING (public.app_rls_org_allowed("org_id"))
  WITH CHECK (public.app_rls_org_allowed("org_id"));--> statement-breakpoint

ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_tickets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "support_tickets_org_rls" ON "support_tickets";--> statement-breakpoint
CREATE POLICY "support_tickets_org_rls" ON "support_tickets"
  FOR ALL
  USING (public.app_rls_support_ticket_allowed("org_id", "user_id"))
  WITH CHECK (public.app_rls_support_ticket_allowed("org_id", "user_id"));--> statement-breakpoint

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "subscriptions_org_rls" ON "subscriptions";--> statement-breakpoint
CREATE POLICY "subscriptions_org_rls" ON "subscriptions"
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
  );
