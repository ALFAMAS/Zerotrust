DROP TABLE "federated_providers" CASCADE;--> statement-breakpoint
DROP TABLE "org_scim_tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "sso_config";