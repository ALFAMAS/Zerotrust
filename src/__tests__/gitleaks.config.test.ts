import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function shannonEntropy(value: string): number {
  const frequencies = new Map<string, number>();
  for (const character of value) {
    frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  }

  return [...frequencies.values()].reduce((entropy, count) => {
    const probability = count / value.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

function loadDatabaseConnectionRule() {
  const config = readFileSync(join(root, ".gitleaks.toml"), "utf8");
  const rule = config.match(
    /\[\[rules\]\][\s\S]*?id\s*=\s*"database-connection-string"[\s\S]*?regex\s*=\s*'''([^']+)'''[\s\S]*?secretGroup\s*=\s*(\d+)[\s\S]*?entropy\s*=\s*([\d.]+)/
  );

  expect(rule, "database connection-string rule").not.toBeNull();
  const [, goPattern, secretGroup, entropy] = rule as RegExpMatchArray;
  const caseInsensitive = goPattern.startsWith("(?i)");

  return {
    config,
    entropy: Number(entropy),
    regex: new RegExp(goPattern.replace(/^\(\?i\)/, ""), caseInsensitive ? "i" : ""),
    secretGroup: Number(secretGroup),
  };
}

function isDetected(candidate: string): boolean {
  const { entropy, regex, secretGroup } = loadDatabaseConnectionRule();
  const match = regex.exec(candidate);
  if (!match) return false;

  return shannonEntropy(match[secretGroup]) >= entropy;
}

describe("Gitleaks database connection-string protection (SEC-ROT)", () => {
  it("extends the built-in rules and is explicitly loaded by CI", () => {
    const { config } = loadDatabaseConnectionRule();
    const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");

    expect(config).toMatch(/\[extend\][\s\S]*useDefault\s*=\s*true/);
    expect(workflow).toContain("GITLEAKS_CONFIG: .gitleaks.toml");
  });

  it("detects a credentialed PostgreSQL URL with a generated password", () => {
    const connectionString = [
      "postgresql://neondb_owner:",
      "npg_K9mQ2xV7cR4tY8wZ",
      "@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require",
    ].join("");

    expect(isDetected(connectionString)).toBe(true);
  });

  it("does not report the documented local development placeholder", () => {
    expect(isDetected("postgresql://zerotrust:password@localhost:5432/zerotrust_test")).toBe(false);
  });
});
