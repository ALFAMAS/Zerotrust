import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("k6 refresh scenario (PERF-3)", () => {
  it("logs in once per VU and carries each rotated refresh token forward", () => {
    const script = readFileSync(join(process.cwd(), "tests", "load", "full-suite.k6.js"), "utf8");
    const refreshScenario = script.slice(
      script.indexOf("export function refreshScenario()"),
      script.indexOf("/** Scenario 3:")
    );

    expect(script).toContain("let refreshToken = null;");
    expect(refreshScenario).toContain("if (!refreshToken)");
    expect(refreshScenario).toContain("refreshToken = extractRefreshToken(refreshRes)");
    expect(script).toContain('dropped_iterations: ["count<50"]');
    expect(script).toMatch(/session_refresh:[\s\S]*?rate: 10,/);
    expect(script).toMatch(/mixed_read:[\s\S]*?rate: 20,/);
    expect(script).toContain("status_read:");
    expect(script).toContain('status_duration_ms: ["p(95)<5000"]');
    expect(script).toContain("export function statusScenario()");
  });
});
