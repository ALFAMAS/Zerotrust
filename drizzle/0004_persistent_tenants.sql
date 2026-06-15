CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"settings" jsonb DEFAULT '{"allowedDomains":[],"enforceSSO":false,"mfaRequired":false,"sessionTTL":3600,"maxUsers":100,"allowedCountries":[]}'::jsonb NOT NULL,
	"oidc_config" jsonb,
	"saml_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
