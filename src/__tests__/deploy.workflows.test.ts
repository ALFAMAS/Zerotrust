import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowsDir = join(process.cwd(), ".github", "workflows");

function readWorkflow(name: string): string {
  return readFileSync(join(workflowsDir, name), "utf8");
}

describe("deploy workflows INF-3", () => {
  it("deploy-production.yml is manual-only with production environment gate", () => {
    const workflow = readWorkflow("deploy-production.yml");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("group: deploy-production");
  });

  it("deploy-production.yml documents PRODUCTION_SSH secrets and safe no-op path", () => {
    const workflow = readWorkflow("deploy-production.yml");
    expect(workflow).toContain("PRODUCTION_SSH_HOST");
    expect(workflow).toContain("PRODUCTION_SSH_USER");
    expect(workflow).toContain("PRODUCTION_SSH_KEY");
    expect(workflow).toContain("PRODUCTION_APP_DIR");
    expect(workflow).toContain('configured=false');
    expect(workflow).toContain("template no-op");
  });

  it("deploy-production.yml restarts API, worker, and UI and chains ops:smoke", () => {
    const workflow = readWorkflow("deploy-production.yml");
    expect(workflow).toContain("pm2 restart zerotrust-api");
    expect(workflow).toContain("pm2 restart zerotrust-worker");
    expect(workflow).toContain("pm2 restart zerotrust-ui");
    expect(workflow).toContain("bun run ops:smoke");
    expect(workflow).toContain("PRODUCTION_API_URL");
    expect(workflow).toContain("PRODUCTION_UI_URL");
    expect(workflow).toContain("skip_smoke");
  });

  it("deploy-staging.yml chains staging-validation via workflow_call", () => {
    const workflow = readWorkflow("deploy-staging.yml");
    expect(workflow).toContain("uses: ./.github/workflows/staging-validation.yml");
    expect(workflow).toContain("environment: staging");
  });
});
