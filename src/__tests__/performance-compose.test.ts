import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("optional database performance profile", () => {
  it("keeps PgBouncer and PgHero out of the default stack", () => {
    const defaultCompose = read("docker-compose.yml");

    expect(defaultCompose).not.toMatch(/^\s{2}(?:pgbouncer|pghero):/m);
  });

  it("pins both tools behind explicit profiles with health checks", () => {
    const compose = read("docker-compose.performance.yml");

    expect(compose).toContain("edoburu/pgbouncer:v1.25.2-p0");
    expect(compose).toContain("ankane/pghero:v3.8.0");
    expect(compose).not.toMatch(/image:\s+[^\n]+:latest/);
    expect(compose).toContain("- pooling");
    expect(compose).toContain("- database-insights");
    expect(compose.match(/healthcheck:/g)).toHaveLength(2);
  });

  it("uses bounded transaction pooling and runtime-only authentication", () => {
    const compose = read("docker-compose.performance.yml");
    const config = read("infra/pgbouncer/pgbouncer.ini");

    expect(config).toMatch(/^pool_mode\s*=\s*transaction$/m);
    expect(config).toMatch(/^auth_type\s*=\s*scram-sha-256$/m);
    expect(config).toMatch(/^auth_file\s*=\s*\/var\/run\/pgbouncer\/userlist\.txt$/m);
    expect(config).toMatch(/^max_client_conn\s*=\s*200$/m);
    expect(config).toMatch(/^default_pool_size\s*=\s*20$/m);
    expect(config).toMatch(/^max_db_connections\s*=\s*40$/m);
    expect(config).toMatch(/^max_prepared_statements\s*=\s*100$/m);
    expect(config).toMatch(/^query_wait_timeout\s*=\s*30$/m);
    expect(config).toMatch(/^idle_transaction_timeout\s*=\s*60$/m);

    expect(compose).toContain("AUTH_FILE: /var/run/pgbouncer/userlist.txt");
    expect(compose).toContain("/var/run/pgbouncer");
    expect(compose).toContain("PGBOUNCER_DATABASE_PASSWORD");
    expect(compose).not.toMatch(/PGBOUNCER_DATABASE_PASSWORD:\s+[^$\n]/);
    expect(config).not.toMatch(/password\s*=/i);
  });

  it("keeps PgHero loopback-only and separate from owner credentials", () => {
    const compose = read("docker-compose.performance.yml");

    expect(compose).toContain('"127.0.0.1:8082:8080"');
    expect(compose).toContain("DATABASE_URL: ${PGHERO_DATABASE_URL:-}");
    expect(compose).not.toContain("DATABASE_URL: ${DATABASE_URL");
    expect(compose).not.toMatch(/postgres(?:ql)?:\/\/zerotrust:/);
  });

  it("provisions query stats through a non-login, read-only diagnostics role", () => {
    const sql = read("scripts/ops/setup-pghero-readonly-role.sql");

    expect(sql).toMatch(/CREATE ROLE zerotrust_pghero NOLOGIN/);
    expect(sql).toMatch(/default_transaction_read_only\s*=\s*on/);
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_stat_statements/);
    expect(sql).toMatch(/GRANT USAGE ON SCHEMA pghero TO zerotrust_pghero/);
    expect(sql).toMatch(/GRANT SELECT ON ALL TABLES IN SCHEMA pghero TO zerotrust_pghero/);
    expect(sql).not.toMatch(/PASSWORD\s+'/i);
    expect(sql).not.toMatch(/SUPERUSER/i);
    expect(sql).not.toMatch(/pg_terminate_backend|pg_stat_statements_reset/i);
  });

  it("documents opt-in credentials and keeps migrations on a direct connection", () => {
    const env = read(".env.example");
    const infraDocs = read("docs/infra/README.md");
    const deploymentDocs = read("docs/deployment.md");

    expect(env).toContain("PGBOUNCER_DATABASE_USER=zerotrust_app_user");
    expect(env).toContain("PGBOUNCER_DATABASE_PASSWORD=");
    expect(env).toContain("PGHERO_DATABASE_URL=");
    expect(env).toContain("PGHERO_USERNAME=");
    expect(env).toContain("PGHERO_PASSWORD=");

    for (const docs of [infraDocs, deploymentDocs]) {
      expect(docs).toContain("docker-compose.performance.yml");
      expect(docs).toContain("DATABASE_MIGRATOR_URL");
      expect(docs).toMatch(/migrations?.+(?:direct|bypass)/is);
      expect(docs).toMatch(/transaction pooling/i);
      expect(docs).toMatch(/127\.0\.0\.1:8082/);
    }
  });
});
