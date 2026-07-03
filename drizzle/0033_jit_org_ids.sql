-- MT-2: replace free-text tenant IDs with organization FKs on cross-tenant JIT requests.
ALTER TABLE "cross_tenant_jit_requests" ADD COLUMN IF NOT EXISTS "requestor_org_id" uuid;
ALTER TABLE "cross_tenant_jit_requests" ADD COLUMN IF NOT EXISTS "target_org_id" uuid;

-- Backfill when legacy text columns hold org UUIDs.
UPDATE "cross_tenant_jit_requests"
SET "requestor_org_id" = "requestor_tenant_id"::uuid
WHERE "requestor_org_id" IS NULL
  AND "requestor_tenant_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE "cross_tenant_jit_requests"
SET "target_org_id" = "target_tenant_id"::uuid
WHERE "target_org_id" IS NULL
  AND "target_tenant_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

ALTER TABLE "cross_tenant_jit_requests" DROP COLUMN IF EXISTS "requestor_tenant_id";
ALTER TABLE "cross_tenant_jit_requests" DROP COLUMN IF EXISTS "target_tenant_id";

ALTER TABLE "cross_tenant_jit_requests"
  ADD CONSTRAINT "cross_tenant_jit_requests_requestor_org_id_fkey"
  FOREIGN KEY ("requestor_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "cross_tenant_jit_requests"
  ADD CONSTRAINT "cross_tenant_jit_requests_target_org_id_fkey"
  FOREIGN KEY ("target_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "cross_tenant_jit_requestor_org_idx"
  ON "cross_tenant_jit_requests" ("requestor_org_id");

CREATE INDEX IF NOT EXISTS "cross_tenant_jit_target_org_idx"
  ON "cross_tenant_jit_requests" ("target_org_id");
