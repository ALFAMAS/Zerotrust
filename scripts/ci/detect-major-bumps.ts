#!/usr/bin/env bun
/**
 * Compare package.json dependency versions before/after a bump and detect
 * semver-major changes. Writes `has_majors=true|false` to GITHUB_OUTPUT when set.
 *
 * Usage: bun scripts/ci/detect-major-bumps.ts <before.json> <after.json> [...]
 */

import { readFileSync } from "node:fs";

type PkgJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function parseMajor(version: string): number | null {
  const cleaned =
    version
      .trim()
      .replace(/^[\^~>=<]+/, "")
      .split("-")[0] ?? "";
  const match = cleaned.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function allDeps(pkg: PkgJson): Record<string, string> {
  return {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
    ...pkg.peerDependencies,
  };
}

function readPkg(path: string): PkgJson {
  return JSON.parse(readFileSync(path, "utf8")) as PkgJson;
}

function detectMajorBumps(beforePath: string, afterPath: string): string[] {
  const before = allDeps(readPkg(beforePath));
  const after = allDeps(readPkg(afterPath));
  const majors: string[] = [];

  for (const [name, afterVersion] of Object.entries(after)) {
    const beforeVersion = before[name];
    if (!beforeVersion) continue;
    const beforeMajor = parseMajor(beforeVersion);
    const afterMajor = parseMajor(afterVersion);
    if (beforeMajor === null || afterMajor === null) continue;
    if (afterMajor > beforeMajor) {
      majors.push(`${name}: ${beforeVersion} → ${afterVersion}`);
    }
  }

  return majors;
}

const pairs = process.argv.slice(2);
if (pairs.length < 2 || pairs.length % 2 !== 0) {
  console.error("Usage: detect-major-bumps.ts <before.json> <after.json> [...]");
  process.exit(2);
}

const allMajors: string[] = [];
for (let i = 0; i < pairs.length; i += 2) {
  allMajors.push(...detectMajorBumps(pairs[i], pairs[i + 1]));
}

const hasMajors = allMajors.length > 0;
console.info(
  hasMajors ? `Major bumps detected:\n${allMajors.join("\n")}` : "No semver-major bumps detected."
);

const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  const line = `has_majors=${hasMajors ? "true" : "false"}\n`;
  Bun.write(outputPath, line);
}

process.exit(0);
