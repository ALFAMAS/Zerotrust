import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import {
  BASELINE_SQL_TAGS,
  buildBaselineRows,
  computeMigrationHash,
  loadJournalEntries,
  readMigrationSql,
  splitMigrationStatements,
} from "../../scripts/ops/db-baseline-push.lib";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCHEMA_DRIFT_SCRIPT = path.join(ROOT, "scripts/ci/check-drizzle-schema-drift.ts");

function runSchemaDriftCheck(): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(process.execPath, [SCHEMA_DRIFT_SCRIPT], {
      cwd: ROOT,
      encoding: "utf-8",
      env: process.env,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

describe("drizzle schema drift gate (MIG-4)", () => {
  it.skipIf(process.platform === "win32")("passes on a clean tree (no generate diff)", () => {
    const { stdout, exitCode } = runSchemaDriftCheck();
    expect(exitCode).toBe(0);
    expect(stdout).toContain("matches committed migrations");
  });
});

describe("db-baseline-push journal helpers (MIG-3)", () => {
  it("computes stable SHA-256 hashes for migration files", () => {
    const sql = readMigrationSql("0031_audit_logs_immutable");
    const hash = computeMigrationHash(sql);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(computeMigrationHash(sql)).toBe(hash);
  });

  it("splits statement-breakpoint migrations into executable statements", () => {
    const sql = readMigrationSql("0035_org_rls_policies");
    const statements = splitMigrationStatements(sql);
    expect(statements.length).toBeGreaterThan(1);
    expect(statements.every((s) => !s.includes("--> statement-breakpoint"))).toBe(true);
  });

  it("lists only missing journal rows when baselining", () => {
    const entries = loadJournalEntries();
    const first = entries[0];
    expect(first).toBeDefined();
    const sql = readMigrationSql(first!.tag);
    const existing = new Set([computeMigrationHash(sql)]);
    const rows = buildBaselineRows(entries, existing);
    expect(rows.some((row) => row.tag === first!.tag)).toBe(false);
    expect(rows.length).toBe(entries.length - 1);
  });

  it("includes the four push-skipped SQL migrations in the baseline set", () => {
    for (const tag of BASELINE_SQL_TAGS) {
      expect(() => readMigrationSql(tag)).not.toThrow();
    }
  });
});
