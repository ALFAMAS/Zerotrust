CREATE INDEX IF NOT EXISTS "otps_user_id_type_idx" ON "otps" USING btree ("user_id","type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_id");
