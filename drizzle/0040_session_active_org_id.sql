-- SEC-11: Persist active org on session row (authoritative tenant context).

ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "active_org_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sessions"
    ADD CONSTRAINT "sessions_active_org_id_organizations_id_fk"
    FOREIGN KEY ("active_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_active_org_id_idx" ON "sessions" ("active_org_id");
