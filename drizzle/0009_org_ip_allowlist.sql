ALTER TABLE "org_security_policies" ADD COLUMN IF NOT EXISTS "ip_allowlist" text[] DEFAULT ARRAY[]::text[] NOT NULL;
