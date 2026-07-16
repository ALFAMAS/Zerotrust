import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const uiRoot = resolve(repoRoot, "packages/ui");

describe("Partytown build contract", () => {
  it("copies the official worker library before development and builds", () => {
    const manifest = JSON.parse(readFileSync(resolve(uiRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const gitignore = readFileSync(resolve(repoRoot, ".gitignore"), "utf8");

    expect(manifest.dependencies["@qwik.dev/partytown"]).toBe("^0.14.0");
    expect(manifest.scripts["partytown:copy"]).toBe(
      "partytown copylib public/~partytown"
    );
    expect(manifest.scripts.predev).toBe("bun run partytown:copy");
    expect(manifest.scripts.prebuild).toBe("bun run partytown:copy");
    expect(manifest.scripts.pretest).toBe("bun run partytown:copy");
    expect(gitignore).toContain("/packages/ui/public/~partytown/");

    for (const file of [
      "partytown.js",
      "partytown-sw.js",
      "partytown-media.js",
      "partytown-atomics.js",
    ]) {
      expect(existsSync(resolve(uiRoot, "public/~partytown", file)), file).toBe(true);
    }
  });

  it("initializes Partytown in the App Router head with GA event forwarding", () => {
    const layout = readFileSync(resolve(uiRoot, "src/app/layout.tsx"), "utf8");

    expect(layout).toContain('from "@qwik.dev/partytown/react"');
    expect(layout).toContain('<Partytown forward={["dataLayer.push"]} />');
  });
});
