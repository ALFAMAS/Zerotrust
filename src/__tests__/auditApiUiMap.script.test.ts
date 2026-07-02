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
    expect(matrix).toContain("| GET | /admin/sessions | packages/ui/src/app/admin/sessions/page.tsx |");
    expect(matrix).toContain("| GET | /admin/users | packages/ui/src/app/admin/users/page.tsx |");
    expect(matrix).toContain("| GET | /admin/users/export | packages/ui/src/app/admin/page.tsx |");
  });
});
