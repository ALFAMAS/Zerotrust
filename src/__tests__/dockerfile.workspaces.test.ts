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

  it("copies the shared-types source required by its workspace export before install", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    const installIndex = dockerfile.indexOf("RUN bun install --frozen-lockfile");
    const sourceCopyIndex = dockerfile.indexOf(
      "COPY packages/shared-types/src ./packages/shared-types/src/"
    );

    expect(sourceCopyIndex).toBeGreaterThan(-1);
    expect(sourceCopyIndex).toBeLessThan(installIndex);
  });

  it("copies shared-types into runtime stages so workspace links resolve", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    const runtimeCopy =
      "COPY --from=builder /app/packages/shared-types ./packages/shared-types";
    const runtimeBunIndex = dockerfile.indexOf("AS runtime-bun");
    const runtimeNodeIndex = dockerfile.indexOf("AS runtime-node");
    const finalRuntimeIndex = dockerfile.indexOf("FROM runtime-${RUNTIME} AS runtime");

    expect(runtimeBunIndex).toBeGreaterThan(-1);
    expect(runtimeNodeIndex).toBeGreaterThan(runtimeBunIndex);
    expect(finalRuntimeIndex).toBeGreaterThan(runtimeNodeIndex);

    const bunCopyIndex = dockerfile.indexOf(runtimeCopy, runtimeBunIndex);
    const nodeCopyIndex = dockerfile.indexOf(runtimeCopy, runtimeNodeIndex);

    expect(bunCopyIndex, "runtime-bun copies shared-types").toBeGreaterThan(runtimeBunIndex);
    expect(bunCopyIndex, "runtime-bun copy precedes runtime-node stage").toBeLessThan(
      runtimeNodeIndex
    );
    expect(nodeCopyIndex, "runtime-node copies shared-types").toBeGreaterThan(runtimeNodeIndex);
    expect(nodeCopyIndex, "runtime-node copy precedes final runtime stage").toBeLessThan(
      finalRuntimeIndex
    );
    expect(dockerfile.split(runtimeCopy).length - 1).toBe(2);
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
