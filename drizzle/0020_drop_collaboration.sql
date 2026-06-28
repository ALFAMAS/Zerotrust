ALTER TABLE "activity_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mentions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "presence" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shared_note_revisions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shared_notes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "activity_events" CASCADE;--> statement-breakpoint
DROP TABLE "mentions" CASCADE;--> statement-breakpoint
DROP TABLE "presence" CASCADE;--> statement-breakpoint
DROP TABLE "shared_note_revisions" CASCADE;--> statement-breakpoint
DROP TABLE "shared_notes" CASCADE;--> statement-breakpoint
ALTER TABLE "tiers" ALTER COLUMN "perks" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
CREATE INDEX "organization_members_user_id_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_members_org_id_role_idx" ON "organization_members" USING btree ("org_id","role");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_revoked_expires_idx" ON "refresh_tokens" USING btree ("user_id","is_revoked","expires_at");--> statement-breakpoint
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens" USING btree ("session_id");