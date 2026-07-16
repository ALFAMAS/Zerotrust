import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("local API profiling tooling", () => {
  const packageJson = JSON.parse(read("package.json")) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it("provides deterministic Bun CPU and heap profiling commands", () => {
    expect(packageJson.scripts["profile:api:cpu"]).toBe(
      "bun --cpu-prof --cpu-prof-dir profiles --cpu-prof-name api.cpuprofile dist/src/api/server.js",
    );
    expect(packageJson.scripts["profile:api:cpu:md"]).toBe(
      "bun --cpu-prof-md --cpu-prof-dir profiles --cpu-prof-name api-cpu.md dist/src/api/server.js",
    );
    expect(packageJson.scripts["profile:api:heap"]).toBe(
      "bun --heap-prof --heap-prof-dir profiles --heap-prof-name api.heapsnapshot dist/src/api/server.js",
    );

    for (const name of ["profile:api:cpu", "profile:api:cpu:md", "profile:api:heap"]) {
      expect(packageJson.scripts[name]).not.toMatch(/\$|%[A-Z_]+%|request|user|shell/i);
    }
  });

  it("pins a local Speedscope viewer to the fixed CPU profile", () => {
    expect(packageJson.devDependencies.speedscope).toBe("1.25.0");
    expect(packageJson.scripts["profile:view"]).toBe("speedscope profiles/api.cpuprofile");
  });

  it("keeps potentially sensitive profile artifacts out of version control", () => {
    const gitignore = read(".gitignore");
    expect(gitignore).toMatch(/^profiles\/$/m);
  });

  it("documents the fixed local-only workflow and data-handling warning", () => {
    const docs = read("docs/infra/README.md");

    expect(docs).toContain("bun run profile:api:cpu");
    expect(docs).toContain("bun run profile:api:cpu:md");
    expect(docs).toContain("bun run profile:api:heap");
    expect(docs).toContain("bun run profile:view");
    expect(docs).toMatch(/local.+diagnostic/i);
    expect(docs).toMatch(/production.+traffic/i);
    expect(docs).toMatch(/sensitive.+memory/i);
  });
});
