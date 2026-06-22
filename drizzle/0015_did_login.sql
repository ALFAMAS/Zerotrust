-- DID login: add a nullable, unique `did` column to users so accounts can be
-- provisioned from a verified Decentralized Identifier (did:key / did:web).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "did" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_did_unique" UNIQUE("did");
EXCEPTION
 WHEN duplicate_object THEN null;
 WHEN duplicate_table THEN null;
END $$;
