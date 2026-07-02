CREATE TABLE "access_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"user_email" text,
	"user_display_name" text,
	"roles_snapshot" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"decision" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_by_email" text,
	"decided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_by_email" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_user_id_key_unique" UNIQUE("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"feature" text NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cross_tenant_jit_requests" (
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
CREATE TABLE "email_suppressions" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_key" text NOT NULL,
	"variant" text NOT NULL,
	"subject_id" text NOT NULL,
	"converted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_results_experiment_key_subject_id_unique" UNIQUE("experiment_key","subject_id")
);
--> statement-breakpoint
CREATE TABLE "federated_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"issuer_url" text NOT NULL,
	"jwks_uri" text,
	"trusted_tenant_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"feature" text NOT NULL,
	"feature_record_id" text,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"mentioned_user_id" uuid NOT NULL,
	"mentioned_by_user_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"notification_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_exchange_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_exchange_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "org_scim_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "org_scim_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "org_security_policies" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"require_passkey_attestation" boolean DEFAULT false NOT NULL,
	"require_hardware_passkey" boolean DEFAULT false NOT NULL,
	"allowed_passkey_aaguids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"denied_passkey_aaguids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"ip_allowlist" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"max_session_age_seconds" integer DEFAULT 0 NOT NULL,
	"idle_timeout_seconds" integer DEFAULT 0 NOT NULL,
	"max_concurrent_sessions" integer DEFAULT 0 NOT NULL,
	"allowed_countries" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"require_trusted_devices" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"sign_count" integer DEFAULT 0 NOT NULL,
	"device_type" text,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"aaguid" text,
	"device_name" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint

--> statement-breakpoint
CREATE TABLE "presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"status" text DEFAULT 'online' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "redemptions_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cost" integer NOT NULL,
	"type" text NOT NULL,
	"value" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redemptions_catalog_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"risk_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"likelihood" integer NOT NULL,
	"impact" integer NOT NULL,
	"risk_score" integer NOT NULL,
	"treatment" text NOT NULL,
	"mitigation" text,
	"owner" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_assessments_year_risk_id_unique" UNIQUE("year","risk_id")
);
--> statement-breakpoint
CREATE TABLE "search_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"query" text NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'global' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_note_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"content" text NOT NULL,
	"edited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soc2_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"implementation" text NOT NULL,
	"evidence" text,
	"status" text DEFAULT 'implemented' NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "soc2_controls_control_id_unique" UNIQUE("control_id")
);
--> statement-breakpoint
CREATE TABLE "streaks" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_login_date" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" uuid,
	"author_role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_exemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"tax_id" text NOT NULL,
	"country" text NOT NULL,
	"business_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"submitted_by" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_exemptions_org_id_tax_id_unique" UNIQUE("org_id","tax_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
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
--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_name" text NOT NULL,
	"device_fingerprint" text NOT NULL,
	"registered_by" uuid,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trusted_devices_org_id_device_fingerprint_unique" UNIQUE("org_id","device_fingerprint")
);
--> statement-breakpoint
CREATE TABLE "user_tiers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tier_key" text NOT NULL,
	"achieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"stripe_payment_intent_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"lifetime_balance" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_customer_id" text,
	"auto_top_up" boolean DEFAULT false NOT NULL,
	"auto_top_up_threshold" integer,
	"auto_top_up_amount" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status_code" integer,
	"response_body" text,
	"error_message" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"duration" integer,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "rate_limit_per_minute" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "monthly_quota" integer;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "entry_hash" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sso_config" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "custom_domain" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "branding" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "storage_region" text DEFAULT 'us' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "did" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "legal_hold" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "legal_hold_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "legal_hold_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "customer_segment" text;--> statement-breakpoint
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_review_id_access_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."access_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioned_by_user_id_users_id_fk" FOREIGN KEY ("mentioned_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_scim_tokens" ADD CONSTRAINT "org_scim_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_scim_tokens" ADD CONSTRAINT "org_scim_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_security_policies" ADD CONSTRAINT "org_security_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_security_policies" ADD CONSTRAINT "org_security_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_catalog_id_redemptions_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."redemptions_catalog"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_tracking" ADD CONSTRAINT "referral_tracking_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_tracking" ADD CONSTRAINT "referral_tracking_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_analytics" ADD CONSTRAINT "search_analytics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_note_revisions" ADD CONSTRAINT "shared_note_revisions_note_id_shared_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."shared_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_note_revisions" ADD CONSTRAINT "shared_note_revisions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_notes" ADD CONSTRAINT "shared_notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_notes" ADD CONSTRAINT "shared_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_notes" ADD CONSTRAINT "shared_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_exemptions" ADD CONSTRAINT "tax_exemptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_exemptions" ADD CONSTRAINT "tax_exemptions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tiers" ADD CONSTRAINT "user_tiers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tiers" ADD CONSTRAINT "user_tiers_tier_key_tiers_key_fk" FOREIGN KEY ("tier_key") REFERENCES "public"."tiers"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_review_items_review_id_idx" ON "access_review_items" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "achievements_user_id_idx" ON "achievements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_events_org_idx" ON "activity_events" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_events_user_idx" ON "activity_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analytics_events_feature_idx" ON "analytics_events" USING btree ("feature","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_user_id_idx" ON "analytics_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "experiment_results_key_variant_idx" ON "experiment_results" USING btree ("experiment_key","variant");--> statement-breakpoint
CREATE INDEX "file_attachments_user_id_idx" ON "file_attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "file_attachments_feature_idx" ON "file_attachments" USING btree ("feature","feature_record_id");--> statement-breakpoint
CREATE INDEX "mentions_user_idx" ON "mentions" USING btree ("mentioned_user_id","created_at");--> statement-breakpoint
CREATE INDEX "org_scim_tokens_org_id_idx" ON "org_scim_tokens" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "passkeys_user_id_idx" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkeys_credential_id_idx" ON "passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "points_ledger_user_id_created_idx" ON "points_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "redemptions_user_id_created_idx" ON "redemptions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "referral_tracking_referral_idx" ON "referral_tracking" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX "referral_tracking_referred_idx" ON "referral_tracking" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX "referrals_code_idx" ON "referrals" USING btree ("code");--> statement-breakpoint
CREATE INDEX "risk_assessments_year_idx" ON "risk_assessments" USING btree ("year");--> statement-breakpoint
CREATE INDEX "search_analytics_created_idx" ON "search_analytics" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "search_analytics_zero_results_idx" ON "search_analytics" USING btree ("result_count","created_at");--> statement-breakpoint
CREATE INDEX "shared_note_revisions_note_idx" ON "shared_note_revisions" USING btree ("note_id","created_at");--> statement-breakpoint
CREATE INDEX "shared_notes_org_idx" ON "shared_notes" USING btree ("org_id","archived");--> statement-breakpoint
CREATE INDEX "shared_notes_created_by_idx" ON "shared_notes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "tax_exemptions_org_id_idx" ON "tax_exemptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "trusted_devices_org_id_idx" ON "trusted_devices" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wallet_transactions_user_id_created_idx" ON "wallet_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_logs_webhook_id_idx" ON "webhook_delivery_logs" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_logs_created_idx" ON "webhook_delivery_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "notifications_user_id_read_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "organizations_custom_domain_idx" ON "organizations" USING btree ("custom_domain");--> statement-breakpoint
CREATE INDEX "organizations_storage_region_idx" ON "organizations" USING btree ("storage_region");--> statement-breakpoint
CREATE INDEX "organizations_tenant_idx" ON "organizations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_is_active_idx" ON "sessions" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_is_active_idx" ON "sessions" USING btree ("expires_at","is_active");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_did_unique" UNIQUE("did");