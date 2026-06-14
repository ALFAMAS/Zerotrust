CREATE TABLE "org_security_policies" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"require_passkey_attestation" boolean DEFAULT false NOT NULL,
	"require_hardware_passkey" boolean DEFAULT false NOT NULL,
	"allowed_passkey_aaguids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"denied_passkey_aaguids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "rate_limit_per_minute" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "monthly_quota" integer;--> statement-breakpoint
ALTER TABLE "org_security_policies" ADD CONSTRAINT "org_security_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_security_policies" ADD CONSTRAINT "org_security_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
