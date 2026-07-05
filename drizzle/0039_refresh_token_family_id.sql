-- SEC-10: Refresh token family lineage for scoped reuse revocation.

ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "family_id" uuid;--> statement-breakpoint
UPDATE "refresh_tokens" SET "family_id" = gen_random_uuid() WHERE "family_id" IS NULL;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_family_id_idx" ON "refresh_tokens" ("family_id");
