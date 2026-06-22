import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("database migrations", () => {
  it("creates the OAuth exchange-code table used by the callback", () => {
    const root = process.cwd();
    const schema = readFileSync(join(root, "src", "db", "schema.ts"), "utf8");
    expect(schema).toContain('pgTable("oauth_exchange_codes"');

    const migrationSql = readdirSync(join(root, "drizzle"))
      .filter((name) => /^\d+_.*\.sql$/.test(name))
      .map((name) => readFileSync(join(root, "drizzle", name), "utf8"))
      .join("\n");

    expect(migrationSql).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? "oauth_exchange_codes"/);
  });
});
