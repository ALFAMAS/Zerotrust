-- Hot-path indexes for auth/session refresh and organization membership lookups.
-- These support the Phase 2 performance target of p95 <100ms on auth/org endpoints.
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_revoked_expires_idx"
  ON "refresh_tokens" ("user_id", "is_revoked", "expires_at");

CREATE INDEX IF NOT EXISTS "refresh_tokens_session_id_idx"
  ON "refresh_tokens" ("session_id");

CREATE INDEX IF NOT EXISTS "organization_members_user_id_idx"
  ON "organization_members" ("user_id");

CREATE INDEX IF NOT EXISTS "organization_members_org_id_role_idx"
  ON "organization_members" ("org_id", "role");
