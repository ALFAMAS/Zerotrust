-- Operator-only read-only Postgres role for NocoDB external base connections.
--
-- NocoDB is NOT part of the zerotrust application — it bypasses API authz, session
-- context, and CSFLE field encryption. Use only for internal ops/analytics on
-- non-sensitive tables or sanitized views. Prefer a read replica in production.
--
-- Run once as a superuser (or zerotrust_migrator_user) after migrations exist:
--   psql -U zerotrust -d zerotrust -f scripts/ops/setup-nocodb-readonly-role.sql
--
-- Production: replace the placeholder password; store in Vault/Infisical — never commit.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zerotrust_nocodb_readonly') THEN
    CREATE ROLE zerotrust_nocodb_readonly NOLOGIN;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zerotrust_nocodb_user') THEN
    CREATE USER zerotrust_nocodb_user WITH PASSWORD 'change-me-nocodb-readonly'
      IN ROLE zerotrust_nocodb_readonly;
  END IF;
END
$$;

-- Subject to RLS like the app role (no BYPASSRLS).
ALTER ROLE zerotrust_nocodb_readonly SET row_security = on;

DO $$
DECLARE dbname text := current_database();
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO zerotrust_nocodb_readonly',
    dbname
  );
END
$$;

GRANT USAGE ON SCHEMA public TO zerotrust_nocodb_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO zerotrust_nocodb_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO zerotrust_nocodb_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO zerotrust_nocodb_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO zerotrust_nocodb_readonly;

REVOKE CREATE ON SCHEMA public FROM zerotrust_nocodb_readonly;

-- Optional: expose only sanitized views instead of raw tables, e.g.:
--   CREATE VIEW ops_user_summary AS SELECT id, email, created_at FROM users;
--   GRANT SELECT ON ops_user_summary TO zerotrust_nocodb_readonly;
--   REVOKE SELECT ON users FROM zerotrust_nocodb_readonly;
