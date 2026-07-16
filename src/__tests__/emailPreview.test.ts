import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const previewDir = resolve(root, "emails");

describe("React Email preview gallery", () => {
  it("exposes all nine production templates with synthetic preview props", () => {
    const previews = readdirSync(previewDir)
      .filter((file) => file.endsWith(".tsx"))
      .sort();

    expect(previews).toEqual([
      "billing-event.tsx",
      "magic-link.tsx",
      "notification.tsx",
      "org-invite.tsx",
      "otp.tsx",
      "password-reset.tsx",
      "security-alert.tsx",
      "verify-email.tsx",
      "welcome.tsx",
    ]);

    for (const preview of previews) {
      const source = readFileSync(resolve(previewDir, preview), "utf8");
      expect(source).toContain("export default");
      expect(source).toContain("PreviewProps");
      expect(source).not.toMatch(/process\.env|token=|secret=/i);
    }
  });

  it("provides the documented email:dev command against the preview directory", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["email:dev"]).toBe("email dev --dir emails --port 3001");
  });
});
