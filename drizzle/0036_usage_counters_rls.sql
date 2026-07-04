-- MT-1 (phase 2): RLS on usage_counters (org-scoped billing metrics).

ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_counters" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "usage_counters_org_rls" ON "usage_counters";--> statement-breakpoint
CREATE POLICY "usage_counters_org_rls" ON "usage_counters"
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
