import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const uiRoot = join(root, "packages", "ui");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("UI performance tooling", () => {
  it("provides Turbopack analysis and standalone bundle-budget commands", () => {
    const manifest = readJson(join(uiRoot, "package.json")) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(manifest.scripts.analyze).toBe("next experimental-analyze");
    expect(manifest.scripts["analyze:output"]).toBe("next experimental-analyze --output");
    expect(manifest.scripts.size).toBe("size-limit");
    expect(manifest.scripts["size:build"]).toBe("bun run build && bun run size");
    expect(manifest.devDependencies["size-limit"]).toMatch(/^\^12\./);
    expect(manifest.devDependencies["@size-limit/file"]).toMatch(/^\^12\./);
  });

  it("sets separate Brotli budgets for production JavaScript and CSS", () => {
    const config = readJson(join(uiRoot, ".size-limit.json")) as Array<{
      name: string;
      path: string;
      limit: string;
    }>;

    expect(config).toEqual([
      {
        name: "Production JavaScript",
        path: ".next/static/chunks/**/*.js",
        limit: expect.stringMatching(/^\d+ kB$/),
      },
      {
        name: "Production CSS",
        path: ".next/static/chunks/**/*.css",
        limit: expect.stringMatching(/^\d+ kB$/),
      },
    ]);
  });

  it("keeps generated Turbopack analysis artifacts out of version control", () => {
    const gitignore = readFileSync(join(root, ".gitignore"), "utf8");

    expect(gitignore.split(/\r?\n/)).toContain("/packages/ui/.next/diagnostics/analyze/");
  });

  it("enforces the bundle budget immediately after the existing CI build", () => {
    const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
    const buildJobStart = workflow.indexOf("  build-ui:");
    const nextJobStart = workflow.indexOf("\n  lighthouse-ci:", buildJobStart);
    const buildJob = workflow.slice(buildJobStart, nextJobStart);
    const buildIndex = buildJob.indexOf("- run: bun run build");
    const sizeIndex = buildJob.indexOf("- run: bun run size");

    expect(buildJobStart).toBeGreaterThan(-1);
    expect(nextJobStart).toBeGreaterThan(buildJobStart);
    expect(buildIndex).toBeGreaterThan(-1);
    expect(sizeIndex).toBeGreaterThan(buildIndex);
  });
});
