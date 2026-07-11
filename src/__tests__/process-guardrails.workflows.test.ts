import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowsDir = join(process.cwd(), ".github", "workflows");
const scriptPath = join(process.cwd(), "scripts", "ci", "detect-major-bumps.ts");

function readWorkflow(name: string): string {
  return readFileSync(join(workflowsDir, name), "utf8");
}

describe("process guardrails workflows (Tier 1)", () => {
  it("dependabot.yml has no semver-major ignores", () => {
    const manifest = readFileSync(join(process.cwd(), ".github", "dependabot.yml"), "utf8");
    expect(manifest).not.toContain("update-types:");
    expect(manifest).not.toContain("ignore:");
  });

  it("dependabot-label.yml routes majors via fetch-metadata", () => {
    const workflow = readWorkflow("dependabot-label.yml");
    expect(workflow).toContain("dependabot/fetch-metadata@");
    expect(workflow).toContain("needs-migration");
    expect(workflow).toContain("automerge");
    expect(workflow).toContain("dependabot[bot]");
  });

  it("dependabot-auto-merge.yml enables squash merge for labeled PRs", () => {
    const workflow = readWorkflow("dependabot-auto-merge.yml");
    expect(workflow).toContain("peter-evans/enable-pull-request-automerge@");
    expect(workflow).toContain("merge-method: squash");
    expect(workflow).toContain("needs-migration");
    expect(workflow).toContain("workflow_run:");
  });

  it("dependency-update.yml detects major bumps before opening PR", () => {
    const workflow = readWorkflow("dependency-update.yml");
    expect(workflow).toContain("detect-major-bumps.ts");
    expect(workflow).toContain("needs-migration");
  });

  it("pr-preview.yml builds compose stack and posts sticky comment", () => {
    const workflow = readWorkflow("pr-preview.yml");
    expect(workflow).toContain("docker-compose.preview.yml");
    expect(workflow).toContain("db:migrate");
    expect(workflow).toContain("/health");
    expect(workflow).toContain("sticky-pull-request-comment@");
    expect(workflow).toContain("PREVIEW_SSH_HOST");
  });
});

describe("detect-major-bumps.ts", () => {
  it("flags semver-major dependency changes", () => {
    const dir = mkdtempSync(join(tmpdir(), "major-bump-"));
    const before = join(dir, "before.json");
    const after = join(dir, "after.json");
    writeFileSync(
      before,
      JSON.stringify({ dependencies: { lodash: "^4.17.0", left: "1.0.0" } }),
    );
    writeFileSync(
      after,
      JSON.stringify({ dependencies: { lodash: "^4.17.0", left: "2.0.0" } }),
    );

    const result = spawnSync("bun", [scriptPath, before, after], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("left");
    expect(result.stdout).toContain("Major bumps detected");
  });

  it("reports no majors for patch/minor bumps", () => {
    const dir = mkdtempSync(join(tmpdir(), "minor-bump-"));
    const before = join(dir, "before.json");
    const after = join(dir, "after.json");
    writeFileSync(before, JSON.stringify({ dependencies: { zod: "^3.22.0" } }));
    writeFileSync(after, JSON.stringify({ dependencies: { zod: "^3.23.0" } }));

    const result = spawnSync("bun", [scriptPath, before, after], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No semver-major bumps");
  });
});
