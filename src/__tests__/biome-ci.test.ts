import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { containsBiomeInternalError } from "../../scripts/ci/run-biome-ci";

describe("Biome CI fail-closed wrapper (DX-4)", () => {
  it("recognizes Biome internal errors even when the child exits zero", () => {
    expect(containsBiomeInternalError("packages/ui/a.tsx internalError/panic INTERNAL")).toBe(true);
    expect(containsBiomeInternalError("Biome encountered an unexpected error")).toBe(true);
    expect(containsBiomeInternalError("Checked 600 files. No fixes applied.")).toBe(false);
  });

  it("lints tests without activating the unstable type-aware scanner rules", () => {
    const root = process.cwd();
    const config = JSON.parse(readFileSync(join(root, "biome.json"), "utf8"));
    const includes = config.files.includes as string[];
    const nursery = config.linter.rules.nursery;
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

    const testExclusion = includes.indexOf("!**/*.test.ts");
    const enrolledTest = includes.indexOf("src/__tests__/biome-ci.test.ts");
    expect(testExclusion).toBeGreaterThan(-1);
    expect(enrolledTest).toBeGreaterThan(testExclusion);
    expect(nursery.noFloatingPromises).toBe("off");
    expect(nursery.noMisusedPromises).toBe("off");
    expect(packageJson.scripts["lint:ci"]).toBe("bun run scripts/ci/run-biome-ci.ts");
  });
});
