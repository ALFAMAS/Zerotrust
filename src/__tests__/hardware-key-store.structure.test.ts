import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("hardware key store structure", () => {
  it("keeps provider implementations outside the selection module", () => {
    const root = join(process.cwd(), "src", "crypto");
    const selection = readFileSync(join(root, "hardware-key-store.ts"), "utf8");
    expect(selection.split(/\r?\n/).length).toBeLessThan(180);

    for (const file of ["software.provider.ts", "platform.provider.ts", "pkcs11.provider.ts"]) {
      expect(existsSync(join(root, "hardware-key-store", file)), file).toBe(true);
    }
  });
});
