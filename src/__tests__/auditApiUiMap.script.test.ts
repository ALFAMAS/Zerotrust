import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("audit-api-ui-map generator", () => {
  it("emits stable slash-separated file paths and resolves server-state path helpers", () => {
    const root = process.cwd();

    execFileSync(process.execPath, [join(root, "scripts", "codegen", "audit-api-ui-map.mjs")], {
      cwd: root,
      stdio: "pipe",
    });

    const matrix = readFileSync(join(root, "docs", "api-ui-integration-matrix.md"), "utf8");
    expect(matrix).not.toContain("src\\");
    expect(matrix).not.toContain("packages\\");

    const frontendCount = Number(
      matrix.match(/\| Frontend API calls discovered \| (\d+) \|/)?.[1] ?? "0"
    );
    expect(frontendCount).toBeGreaterThanOrEqual(55);

    const dispositionCount = Number(
      matrix.match(/\| Product-surface decisions excluded from unmatched list \| (\d+) \|/)?.[1] ??
        "0"
    );
    expect(dispositionCount).toBe(2);

    expect(matrix).toContain(
      "| GET | /admin/feedback | packages/ui/src/lib/server-state/adminFeedback.ts |"
    );
    expect(matrix).toContain(
      "| GET | /admin/attachments | packages/ui/src/lib/server-state/adminContent.ts |"
    );
    expect(matrix).toContain("| GET | /auth/unsubscribe |");
    expect(matrix).toContain("| POST | /wallet/spend |");
  });
});
