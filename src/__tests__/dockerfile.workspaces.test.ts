import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("API Docker workspace install (CI-4)", () => {
  it("copies every workspace manifest before the frozen install", () => {
    const root = process.cwd();
    const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
    const installIndex = dockerfile.indexOf("RUN bun install --frozen-lockfile");
    const workspaces = readdirSync(join(root, "packages"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(root, "packages", name, "package.json")));

    expect(installIndex).toBeGreaterThan(-1);
    expect(workspaces.length).toBeGreaterThan(0);

    for (const workspace of workspaces) {
      const copyInstruction = `COPY packages/${workspace}/package.json ./packages/${workspace}/`;
      const copyIndex = dockerfile.indexOf(copyInstruction);

      expect(copyIndex, `${workspace} manifest is copied`).toBeGreaterThan(-1);
      expect(copyIndex, `${workspace} manifest is copied before bun install`).toBeLessThan(
        installIndex
      );
    }
  });

  it("recursively excludes generated workspace trees from the build context", () => {
    const dockerignore = readFileSync(join(process.cwd(), ".dockerignore"), "utf8");

    for (const pattern of [
      "**/node_modules",
      "**/.next",
      "**/coverage",
      "**/test-results",
      "**/playwright-report",
    ]) {
      expect(dockerignore.split(/\r?\n/)).toContain(pattern);
    }
  });
});
