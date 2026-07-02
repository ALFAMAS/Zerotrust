import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("audit-api-ui-map generator", () => {
  it("emits stable slash-separated file paths on every platform", () => {
    const root = process.cwd();

    execFileSync(process.execPath, [join(root, "scripts", "audit-api-ui-map.mjs")], {
      cwd: root,
      stdio: "pipe",
    });

    const matrix = readFileSync(join(root, "docs", "api-ui-integration-matrix.md"), "utf8");
    expect(matrix).not.toContain("src\\");
    expect(matrix).not.toContain("packages\\");
    expect(matrix).toContain("| GET | /admin/sessions | src/api/routes/admin.routes.ts |");
    expect(matrix).toContain("| GET | /admin/users | src/api/routes/admin.routes.ts |");
    expect(matrix).toContain("| GET | /admin/users/export | src/api/routes/admin-tools.routes.ts |");
  });
});
