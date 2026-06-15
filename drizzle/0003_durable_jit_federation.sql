CREATE TABLE IF NOT EXISTS "cross_tenant_jit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requestor_user_id" uuid NOT NULL,
	"requestor_tenant_id" text DEFAULT 'default' NOT NULL,
	"target_tenant_id" text NOT NULL,
	"target_resource" text NOT NULL,
	"justification" text NOT NULL,
	"ttl_seconds" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "federated_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"issuer_url" text NOT NULL,
	"jwks_uri" text,
	"trusted_tenant_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
