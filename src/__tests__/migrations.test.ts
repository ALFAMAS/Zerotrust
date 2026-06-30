import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("database migrations", () => {
  const migrationSql = () =>
    readdirSync(join(process.cwd(), "drizzle"))
      .filter((name) => /^\d+_.*\.sql$/.test(name))
      .map((name) => readFileSync(join(process.cwd(), "drizzle", name), "utf8"))
      .join("\n");

  it("creates the OAuth exchange-code table used by the callback", () => {
    const root = process.cwd();
    const schema = readFileSync(join(root, "src", "db", "schema.ts"), "utf8");
    expect(schema).toContain('pgTable("oauth_exchange_codes"');

    expect(migrationSql()).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? "oauth_exchange_codes"/);
  });

  it("creates the processed webhook events table used by replay guards", () => {
    const root = process.cwd();
    const schema = readFileSync(join(root, "src", "db", "schema.ts"), "utf8");
    expect(schema).toContain('"processed_webhook_events"');

    const sql = migrationSql();
    expect(sql).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? "processed_webhook_events"/);
    expect(sql).toContain(
      'CONSTRAINT "processed_webhook_events_consumer_key_unq" UNIQUE("consumer","event_key")'
    );
  });
});
