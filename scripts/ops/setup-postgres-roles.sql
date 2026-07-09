-- SEC-25: dual Postgres roles — app (DML + RLS) and migrator (DDL only).
--
-- Run once as a superuser after the database exists and migrations have been
-- applied at least once (so tables/sequences exist to grant on).
--
-- Usage (local docker-compose):
--   psql -U zerotrust -d zerotrust -f scripts/setup-postgres-roles.sql
--
-- Production: replace placeholder passwords before running; store credentials in
-- Coolify/env — never commit secrets.

\set ON_ERROR_STOP on

-- ── Roles ────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zerotrust_app') THEN
    CREATE ROLE zerotrust_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zerotrust_migrator') THEN
    CREATE ROLE zerotrust_migrator NOLOGIN;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zerotrust_app_user') THEN
    CREATE USER zerotrust_app_user WITH PASSWORD 'change-me-app' IN ROLE zerotrust_app;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zerotrust_migrator_user') THEN
    CREATE USER zerotrust_migrator_user WITH PASSWORD 'change-me-migrator' IN ROLE zerotrust_migrator;
  END IF;
END
$$;

-- App connections must respect RLS even when the role owns objects.
ALTER ROLE zerotrust_app SET row_security = on;

DO $$
DECLARE dbname text := current_database();
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO zerotrust_app, zerotrust_migrator', dbname);
END
$$;
GRANT USAGE ON SCHEMA public TO zerotrust_app, zerotrust_migrator;

-- ── App role: DML only (no CREATE / DDL) ─────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zerotrust_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO zerotrust_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zerotrust_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO zerotrust_app;

REVOKE CREATE ON SCHEMA public FROM zerotrust_app;

-- ── Migrator role: DDL for deploy/migrate step only ──────────────────────────

GRANT CREATE ON SCHEMA public TO zerotrust_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO zerotrust_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO zerotrust_migrator;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO zerotrust_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO zerotrust_migrator;

-- RLS policies are defined in drizzle migrations (FORCE ROW LEVEL SECURITY on
-- org-scoped tables). The app role is subject to those policies; the migrator
-- role is used only by `bun run db:migrate` / `db:push` during deploy.
