-- Provision PgHero query-stat views without granting owner or write access.
-- Run as the database administrator after enabling pg_stat_statements in
-- shared_preload_libraries, then set a password interactively with:
--   \password zerotrust_pghero_user

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zerotrust_pghero') THEN
    CREATE ROLE zerotrust_pghero NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zerotrust_pghero_user') THEN
    CREATE ROLE zerotrust_pghero_user LOGIN IN ROLE zerotrust_pghero;
  END IF;
END
$$;

ALTER ROLE zerotrust_pghero SET default_transaction_read_only = on;
ALTER ROLE zerotrust_pghero SET search_path = pghero, pg_catalog, public;
ALTER ROLE zerotrust_pghero SET lock_timeout = '1s';
ALTER ROLE zerotrust_pghero_user SET default_transaction_read_only = on;
ALTER ROLE zerotrust_pghero_user SET search_path = pghero, pg_catalog, public;
ALTER ROLE zerotrust_pghero_user SET lock_timeout = '1s';

DO $$
DECLARE
  dbname text := current_database();
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO zerotrust_pghero', dbname);
END
$$;

CREATE SCHEMA IF NOT EXISTS pghero;
REVOKE ALL ON SCHEMA pghero FROM PUBLIC;

CREATE OR REPLACE FUNCTION pghero.pg_stat_activity()
RETURNS SETOF pg_catalog.pg_stat_activity
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT * FROM pg_catalog.pg_stat_activity;
$$;

CREATE OR REPLACE VIEW pghero.pg_stat_activity AS
  SELECT * FROM pghero.pg_stat_activity();

CREATE OR REPLACE FUNCTION pghero.pg_stat_statements()
RETURNS SETOF public.pg_stat_statements
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT * FROM public.pg_stat_statements;
$$;

CREATE OR REPLACE VIEW pghero.pg_stat_statements AS
  SELECT * FROM pghero.pg_stat_statements();

CREATE OR REPLACE FUNCTION pghero.pg_stats()
RETURNS TABLE(
  schemaname name,
  tablename name,
  attname name,
  null_frac real,
  avg_width integer,
  n_distinct real
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT schemaname, tablename, attname, null_frac, avg_width, n_distinct
  FROM pg_catalog.pg_stats;
$$;

CREATE OR REPLACE VIEW pghero.pg_stats AS
  SELECT * FROM pghero.pg_stats();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pghero FROM PUBLIC;
GRANT USAGE ON SCHEMA pghero TO zerotrust_pghero;
GRANT EXECUTE ON FUNCTION pghero.pg_stat_activity() TO zerotrust_pghero;
GRANT EXECUTE ON FUNCTION pghero.pg_stat_statements() TO zerotrust_pghero;
GRANT EXECUTE ON FUNCTION pghero.pg_stats() TO zerotrust_pghero;
GRANT SELECT ON ALL TABLES IN SCHEMA pghero TO zerotrust_pghero;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO zerotrust_pghero;

ALTER DEFAULT PRIVILEGES IN SCHEMA pghero
  GRANT SELECT ON TABLES TO zerotrust_pghero;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zerotrust_migrator') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE zerotrust_migrator IN SCHEMA public GRANT SELECT ON SEQUENCES TO zerotrust_pghero';
  END IF;
END
$$;
