import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("database migrations", () => {
  const schemaSql = () => {
    const root = process.cwd();
    return readFileSync(join(root, "src", "db", "schema", "tables.ts"), "utf8");
  };

  const migrationSql = () =>
    readdirSync(join(process.cwd(), "drizzle"))
      .filter((name) => /^\d+_.*\.sql$/.test(name))
      .map((name) => readFileSync(join(process.cwd(), "drizzle", name), "utf8"))
      .join("\n");

  it("creates the OAuth exchange-code table used by the callback", () => {
    const schema = schemaSql();
    expect(schema).toContain('pgTable("oauth_exchange_codes"');

    expect(migrationSql()).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? "oauth_exchange_codes"/);
  });

  it("creates the processed webhook events table used by replay guards", () => {
    const schema = schemaSql();
    expect(schema).toContain('"processed_webhook_events"');

    const sql = migrationSql();
    expect(sql).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? "processed_webhook_events"/);
    expect(sql).toContain(
      'CONSTRAINT "processed_webhook_events_consumer_key_unq" UNIQUE("consumer","event_key")'
    );
  });

  it("enables org RLS policies on webhook and support tables", () => {
    const sql = migrationSql();
    expect(sql).toContain('CREATE POLICY "webhook_endpoints_org_rls"');
    expect(sql).toContain('CREATE POLICY "support_tickets_org_rls"');
    expect(sql).toContain("app_rls_org_allowed");
  });
});
