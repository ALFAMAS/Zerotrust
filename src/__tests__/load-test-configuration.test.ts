import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("full-suite k6 refresh scenario", () => {
  it("assigns each VU a distinct seeded user to avoid session-cap revocation", () => {
    const script = readFileSync(join(process.cwd(), "tests/load/full-suite.k6.js"), "utf8");

    expect(script).toContain("const user = testUsers[(__VU - 1) % testUsers.length];");
    expect(script).not.toContain("const user = testUsers[0];");
  });
});
